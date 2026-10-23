import { Global, Injectable, Module, type Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MailerService } from '../mailer.service';
import { MailerTestModule } from '../testing/mailer-test.module';
import { TestMailbox } from '../transports/test-mailbox';
import { messageIdFor } from '../utils/recipients';
import {
  DEFAULT_MAILER_OUTBOX_CONSUMER,
  DEFAULT_MAILER_OUTBOX_TOPIC,
  MAILER_OUTBOX_OPTIONS,
  MailerOutbox,
  MailerOutboxHandler,
  MailerOutboxModule,
} from './index';
import { BUFFER_TAG } from './serialize';

// `@nestjs/outbox` is ESM-only and Jest cannot load it: a stand-in with the
// parts this integration uses (test/outbox.interop.test.mjs runs the real one)
jest.mock(
  '@nestjs/outbox',
  () => {
    class NonRetryableMessageError extends Error {
      name = 'NonRetryableMessageError';
    }
    class Outbox {
      add = jest.fn((_tx: unknown, message: Record<string, unknown>) => ({
        id: 'message-1',
        ...message,
      }));
      notify = jest.fn();
    }
    const OnOutboxMessage = jest.fn(
      (topic: string, options: Record<string, unknown>) =>
        (_target: object, _key: string, descriptor: PropertyDescriptor) => {
          Reflect.defineMetadata(
            'nestjs:outbox:handlers',
            [{ ...options, topics: [topic] }],
            descriptor.value,
          );
          return descriptor;
        },
    );
    return { NonRetryableMessageError, OnOutboxMessage, Outbox };
  },
  { virtual: true },
);

const { NonRetryableMessageError, OnOutboxMessage, Outbox } =
  jest.requireMock('@nestjs/outbox');

@Injectable()
class WelcomeMail {
  render(user: { name: string }, { locale }: { locale?: string }) {
    return {
      subject: `Welcome ${user.name}`,
      html: `<p>Hi ${user.name} (${locale ?? 'default'})</p>`,
    };
  }
}

@Global()
@Module({
  providers: [{ provide: Outbox, useFactory: () => new Outbox() }],
  exports: [Outbox],
})
class FakeOutboxModule {}

function handlerOf(module: {
  providers?: unknown[];
}): Type<MailerOutboxHandler> {
  return module.providers?.find(
    (provider) =>
      typeof provider === 'function' &&
      provider.prototype instanceof MailerOutboxHandler,
  ) as Type<MailerOutboxHandler>;
}

function context(id = 'message-1') {
  return {
    message: { id },
    consumer: 'mailer',
    attempt: 1,
    signal: new AbortController().signal,
  } as any;
}

describe('MailerOutboxModule', () => {
  let moduleRef: TestingModule;
  let mailbox: TestMailbox;
  let mailerOutbox: MailerOutbox;
  let handler: MailerOutboxHandler;
  let official: InstanceType<typeof Outbox>;

  beforeEach(async () => {
    const outboxModule = MailerOutboxModule.register({
      mailables: [WelcomeMail],
    });
    moduleRef = await Test.createTestingModule({
      imports: [MailerTestModule.register(), FakeOutboxModule, outboxModule],
    }).compile();
    mailbox = moduleRef.get(TestMailbox);
    mailerOutbox = moduleRef.get(MailerOutbox);
    handler = moduleRef.get(handlerOf(outboxModule));
    official = moduleRef.get(Outbox);
  });

  afterEach(() => moduleRef.close());

  describe('register()', () => {
    it('applies the defaults and decorates a handler for the topic', () => {
      const module = MailerOutboxModule.register();
      expect(module.global).toBe(false);
      expect(module.exports).toEqual([MailerOutbox]);
      const options = (module.providers as any[]).find(
        (p) => p.provide === MAILER_OUTBOX_OPTIONS,
      ).useValue;
      expect(options).toMatchObject({
        topic: DEFAULT_MAILER_OUTBOX_TOPIC,
        consumer: DEFAULT_MAILER_OUTBOX_CONSUMER,
        inbox: true,
      });
      expect(options.mailables.size).toBe(0);
      const Handler = handlerOf(module);
      expect(
        Reflect.getMetadata('nestjs:outbox:handlers', Handler.prototype.handle),
      ).toEqual([{ consumer: 'mailer', inbox: true, topics: ['mailer.send'] }]);
    });

    it('gives each registration a handler method of its own', () => {
      const a = handlerOf(MailerOutboxModule.register({ topic: 'a' }));
      const b = handlerOf(
        MailerOutboxModule.register({
          topic: 'b',
          consumer: 'emails',
          inbox: false,
          global: true,
        }),
      );
      expect(a.prototype.handle).not.toBe(b.prototype.handle);
      expect(OnOutboxMessage).toHaveBeenLastCalledWith('b', {
        consumer: 'emails',
        inbox: false,
      });
    });

    it('stores mail classes under their record keys', () => {
      const module = MailerOutboxModule.register({
        mailables: { welcome: WelcomeMail },
      });
      const options = (module.providers as any[]).find(
        (p) => p.provide === MAILER_OUTBOX_OPTIONS,
      ).useValue;
      expect(options.mailables.get('welcome')).toBe(WelcomeMail);
      expect(options.names.get(WelcomeMail)).toBe('welcome');
    });

    it.each([
      [[null]],
      [[(() => class {})()]],
      [{ '': WelcomeMail }],
      [{ welcome: 'WelcomeMail' }],
    ])('refuses %p as mailables', (mailables) => {
      expect(() =>
        MailerOutboxModule.register({ mailables: mailables as any }),
      ).toThrow('must be a named mail class');
    });

    it('refuses two mail classes with the same name', () => {
      const Other = (() => {
        class WelcomeMail {}
        return WelcomeMail;
      })();
      expect(() =>
        MailerOutboxModule.register({
          mailables: [WelcomeMail, Other as any],
        }),
      ).toThrow('two mail classes in `mailables` are named "WelcomeMail"');
    });
  });

  describe('MailerOutbox', () => {
    it('records send options under the topic, with the message options', () => {
      const tx = { id: 'tx' };
      const message = mailerOutbox.add(
        tx,
        { to: 'ada@example.com', subject: 'Hi' },
        { key: 'user-1', delay: '5m' },
      );
      expect(official.add).toHaveBeenCalledWith(tx, {
        key: 'user-1',
        delay: '5m',
        topic: 'mailer.send',
        payload: { v: 1, mail: { to: 'ada@example.com', subject: 'Hi' } },
      });
      expect(message).toMatchObject({ id: 'message-1' });
      expect(mailerOutbox.topic).toBe('mailer.send');
    });

    it('records a mail class by name', () => {
      mailerOutbox.add(undefined, {
        mail: WelcomeMail,
        to: 'ada@example.com',
        data: { name: 'Ada' },
      });
      expect(official.add.mock.calls[0][1].payload).toEqual({
        v: 1,
        mailable: 'WelcomeMail',
        options: { to: 'ada@example.com', data: { name: 'Ada' } },
      });
    });

    it('refuses a mail class missing from `mailables`', () => {
      class OtherMail {
        render() {
          return {};
        }
      }
      expect(() =>
        mailerOutbox.add(undefined, { mail: OtherMail as any }),
      ).toThrow(TypeError);
      expect(official.add).not.toHaveBeenCalled();
    });

    it('notify() wakes the relay', () => {
      mailerOutbox.notify();
      expect(official.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('handler', () => {
    it('sends with the message id as idempotency key, without retries', async () => {
      const spy = jest.spyOn(moduleRef.get(MailerService), 'sendMail');
      const ctx = context('0190-abc');

      await handler.handle(
        {
          v: 1,
          mail: {
            to: 'ada@example.com',
            from: 'app@example.com',
            subject: 'Hi',
            html: { [BUFFER_TAG]: Buffer.from('<p>Hi</p>').toString('base64') },
          },
        },
        ctx,
      );

      const options = spy.mock.calls[0][0];
      expect(options).toMatchObject({
        idempotencyKey: '0190-abc',
        retry: false,
        signal: ctx.signal,
      });
      expect(Buffer.isBuffer(options.html)).toBe(true);
      const mail = mailbox.assertSent({ to: 'ada@example.com', subject: 'Hi' });
      expect(mail.messageId).toBe(messageIdFor('0190-abc', 'app@example.com'));
      expect(mail.html).toBe('<p>Hi</p>');
    });

    it('keeps an idempotency key the email was recorded with', async () => {
      const spy = jest.spyOn(moduleRef.get(MailerService), 'sendMail');
      await handler.handle(
        { v: 1, mail: { to: 'ada@example.com', idempotencyKey: 'order-42' } },
        context(),
      );
      expect(spy.mock.calls[0][0].idempotencyKey).toBe('order-42');
    });

    it('renders a mail class found by name', async () => {
      const spy = jest.spyOn(moduleRef.get(MailerService), 'send');
      await handler.handle(
        {
          v: 1,
          mailable: 'WelcomeMail',
          options: {
            to: 'ada@example.com',
            data: { name: 'Ada' },
            locale: 'es',
          },
        },
        context('m-2'),
      );
      expect(spy.mock.calls[0][0]).toBe(WelcomeMail);
      expect(spy.mock.calls[0][1]).toMatchObject({
        idempotencyKey: 'm-2',
        retry: false,
      });
      const mail = mailbox.assertSent({
        subject: 'Welcome Ada',
        mail: WelcomeMail,
      });
      expect(mail.html).toBe('<p>Hi Ada (es)</p>');
    });

    it('dead-letters a mail class that is not registered', async () => {
      await expect(
        handler.handle(
          { v: 1, mailable: 'RemovedMail', options: {} },
          context('m-3'),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'NonRetryableMessageError',
          message: expect.stringContaining('"RemovedMail"'),
        }),
      );
      expect(mailbox.mails).toHaveLength(0);
    });

    it.each([
      null,
      'text',
      [],
      { v: 2, mail: {} },
      { v: 1 },
      { v: 1, mail: [] },
      { v: 1, mailable: 'WelcomeMail' },
      { v: 1, mailable: 'WelcomeMail', options: null },
    ])('dead-letters the unreadable payload %p', async (payload) => {
      const error = await handler
        .handle(payload, context('m-4'))
        .catch((e) => e);
      expect(error).toBeInstanceOf(NonRetryableMessageError);
      expect(error.message).toBe(
        'MailerOutbox: message m-4 holds no email this version can read',
      );
    });

    it('dead-letters a permanent failure, keeping it as the cause', async () => {
      const bounce = Object.assign(new Error('550 Mailbox unavailable'), {
        responseCode: 550,
      });
      mailbox.failNext(bounce);

      const error = await handler
        .handle({ v: 1, mail: { to: 'nobody@example.com' } }, context())
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableMessageError);
      expect(error.message).toBe('550 Mailbox unavailable');
      expect(error.cause).toMatchObject({ responseCode: 550 });
    });

    it('dead-letters a permanent failure that is not an Error', async () => {
      const failure = { permanent: true };
      jest
        .spyOn(moduleRef.get(MailerService), 'sendMail')
        .mockRejectedValueOnce(failure);

      const error = await handler
        .handle({ v: 1, mail: {} }, context())
        .catch((e) => e);

      expect(error).toBeInstanceOf(NonRetryableMessageError);
      expect(error.message).toBe('[object Object]');
      expect(error.cause).toBe(failure);
    });

    it('rethrows a transient failure for the outbox to retry', async () => {
      const refused = Object.assign(new Error('Connection refused'), {
        code: 'ECONNECTION',
      });
      jest
        .spyOn(moduleRef.get(MailerService), 'sendMail')
        .mockRejectedValueOnce(refused);

      await expect(
        handler.handle({ v: 1, mail: { to: 'ada@example.com' } }, context()),
      ).rejects.toBe(refused);
    });
  });
});
