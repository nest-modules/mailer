import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HandlebarsAdapter } from './adapters/handlebars.adapter';
import {
  MailerConnectionError,
  MailerMessageError,
  MailerSmtpError,
  MailerTemplateError,
  MailerTimeoutError,
} from './errors/mailer.errors';
import { Mailable, MailableContext } from './interfaces/mailable.interface';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerService } from './mailer.service';
import { MailerEventService } from './mailer-event.service';
import { MailerTestModule } from './testing/mailer-test.module';
import { FileTransport } from './transports/file.transport';
import { LogTransport } from './transports/log.transport';
import { TestMailbox } from './transports/test-mailbox';
import { html } from './utils/safe-html';

interface StubTransporter {
  use: jest.Mock;
  sendMail: jest.Mock;
}

function stub(sendMail?: jest.Mock): StubTransporter {
  return {
    use: jest.fn(),
    sendMail:
      sendMail ??
      jest.fn(async (mail: ISendMailOptions) => ({ messageId: 'id', mail })),
  };
}

/** Hands out the stubs in the order MailerService creates transporters: named ones first */
function factory(...stubs: StubTransporter[]): MailerTransportFactory {
  const queue = [...stubs];
  return { createTransport: jest.fn(() => (queue.shift() ?? stub()) as any) };
}

function events(): [MailerEventService, jest.Mock] {
  const emit = jest.fn();
  return [new MailerEventService({ emit }), emit];
}

function eventNames(emit: jest.Mock): string[] {
  return emit.mock.calls.map(([name]) => name);
}

const fail = (props: Record<string, unknown>, message = 'failed') =>
  Object.assign(new Error(message), props);

/** No waiting between attempts */
const fast = { backoff: { delay: 0, jitter: 'none' as const } };

describe('MailerService (v4)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('mail classes', () => {
    @Injectable()
    class Greeter {
      greet(name: string) {
        return `Hello ${name}`;
      }
    }

    @Injectable()
    class WelcomeMail implements Mailable<{ name: string }> {
      constructor(private readonly greeter: Greeter) {}

      render({ name }: { name: string }, { locale, to }: MailableContext) {
        return {
          subject: this.greeter.greet(name),
          html: `<p>${locale ?? 'default'} ${to.map((a) => a.address).join(',')}</p>`,
          from: 'rendered@example.com',
          headers: { 'X-Mail': 'welcome', 'X-Shared': 'rendered' },
          attachments: [{ filename: 'a.txt', content: 'a' }],
        };
      }
    }

    // A class that isn't a provider is created in the mailer's scope, where
    // global modules are visible (as with @nestjs/mail)
    @Global()
    @Module({ providers: [Greeter], exports: [Greeter] })
    class GreeterModule {}

    async function setup(extraProviders: any[] = []) {
      const moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register(), GreeterModule],
        providers: extraProviders,
      }).compile();
      return {
        moduleRef,
        mailer: moduleRef.get(MailerService),
        mailbox: moduleRef.get(TestMailbox),
      };
    }

    it('should render a class created with its dependencies and send it', async () => {
      const { moduleRef, mailer, mailbox } = await setup();

      await mailer.send(WelcomeMail, {
        to: 'Ada <ada@example.com>',
        data: { name: 'Ada' },
        locale: 'es',
      });

      const mail = mailbox.assertSent({
        to: 'ada@example.com',
        mail: WelcomeMail,
      });
      expect(mail.subject).toBe('Hello Ada');
      expect(mail.html).toBe('<p>es ada@example.com</p>');
      expect(mail.locale).toBe('es');
      await moduleRef.close();
    });

    it('should reuse a class registered as a provider, and cache it', async () => {
      const { moduleRef, mailer } = await setup([WelcomeMail]);
      const registered = moduleRef.get(WelcomeMail);
      const render = jest.spyOn(registered, 'render');

      await mailer.send(WelcomeMail, { to: 'a@x.com', data: { name: 'A' } });
      await mailer.send(WelcomeMail, { to: 'b@x.com', data: { name: 'B' } });

      expect(render).toHaveBeenCalledTimes(2);
      await moduleRef.close();
    });

    it('should merge per-send options over what render() returned', async () => {
      const { moduleRef, mailer, mailbox } = await setup();

      await mailer.send(WelcomeMail, {
        to: 'a@x.com',
        data: { name: 'A' },
        from: 'override@example.com',
        replyTo: undefined,
        headers: { 'X-Shared': 'send' },
        attachments: [{ filename: 'b.txt', content: 'b' }],
      });

      const mail = mailbox.assertSent();
      expect(mail.from).toBe('override@example.com');
      expect(mail.headers).toEqual({ 'X-Mail': 'welcome', 'X-Shared': 'send' });
      expect(mail.attachments.map((a) => a.filename)).toEqual([
        'a.txt',
        'b.txt',
      ]);
      await moduleRef.close();
    });

    it('should accept an instance, and render without sending', async () => {
      const { moduleRef, mailer, mailbox } = await setup();
      const instance: Mailable<void> = {
        render: () => ({ subject: 'Instance', text: 'Plain' }),
      };

      await mailer.send(instance, { to: 'a@x.com' });
      // A class rendering `void` needs no options
      await mailer.send(instance);
      await expect(mailer.render(instance)).resolves.toEqual(
        expect.objectContaining({ subject: 'Instance', text: 'Plain' }),
      );
      const rendered = await mailer.render(WelcomeMail, {
        data: { name: 'Ada' },
      });

      expect(mailbox.assertSent().subject).toBe('Instance');
      expect(rendered).toEqual(
        expect.objectContaining({
          subject: 'Hello Ada',
          html: '<p>default </p>',
          from: 'rendered@example.com',
        }),
      );
      expect(mailbox.mails).toHaveLength(2);
      await moduleRef.close();
    });

    it('should create classes with `new` outside of Nest', async () => {
      class Plain implements Mailable<void> {
        render() {
          return { subject: 'Plain', text: 'Hi' };
        }
      }
      const transporter = stub();
      const service = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(transporter),
      );

      await service.send(Plain, { to: 'a@x.com' });

      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Plain',
          attachments: [],
          mailable: Plain,
        }),
      );
    });

    it('should merge headers given in the array format', async () => {
      const transporter = stub();
      const service = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(transporter),
      );
      const send = (rendered: any, given: any) =>
        service.send(
          { render: () => ({ subject: 's', headers: rendered }) },
          {
            headers: given,
          },
        );

      await send(
        [
          { key: 'X-A', value: '1' },
          { key: 'x-b', value: '2' },
        ],
        {
          'X-B': '3',
        },
      );
      expect(transporter.sendMail.mock.calls[0][0].headers).toEqual([
        { key: 'X-A', value: '1' },
        { key: 'X-B', value: '3' },
      ]);

      await send({ 'X-A': '1' }, [{ key: 'X-C', value: '4' }]);
      expect(transporter.sendMail.mock.calls[1][0].headers).toEqual([
        { key: 'X-A', value: '1' },
        { key: 'X-C', value: '4' },
      ]);

      await send(undefined, { 'X-D': '5' });
      expect(transporter.sendMail.mock.calls[2][0].headers).toEqual({
        'X-D': '5',
      });
    });

    it('should send a plain options object with send()', async () => {
      const transporter = stub();
      const service = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(transporter),
      );

      await service.send({ to: 'a@x.com', subject: 'Inline' });

      expect(transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Inline' }),
      );
    });
  });

  describe('render', () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-render-'));
      fs.writeFileSync(path.join(dir, 'hello.hbs'), '<p>Hello {{name}}</p>');
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const service = (options: Partial<MailerOptions> = {}) =>
      new MailerService(
        { transport: 'smtp://x', ...options } as MailerOptions,
        factory(),
      );

    it('should render a template with the configured adapter', async () => {
      const rendered = await service({
        template: {
          dir,
          adapter: new HandlebarsAdapter(undefined, {
            inlineCssEnabled: false,
          }),
        },
        defaults: { from: 'app@example.com', replyTo: 'help@example.com' },
      }).render({
        to: 'a@x.com',
        subject: 'Hi {{name}}',
        template: 'hello',
        context: { name: 'Ada' },
        locale: 'en',
      });

      expect(rendered).toEqual({
        subject: 'Hi Ada',
        html: '<p>Hello Ada</p>',
        text: undefined,
        from: 'app@example.com',
        to: 'a@x.com',
        cc: undefined,
        bcc: undefined,
        replyTo: 'help@example.com',
        attachments: [],
        headers: undefined,
        template: 'hello',
        locale: 'en',
      });
    });

    it('should not call the adapter for inline or text-only content', async () => {
      const adapter = { compile: jest.fn() };
      const mailer = service({ template: { dir, adapter } });

      const inline = await mailer.render({ html: Buffer.from('<b>x</b>') });
      const textOnly = await mailer.render({ text: Buffer.from('plain') });

      expect(inline.html).toBe('<b>x</b>');
      expect(textOnly.text).toBe('plain');
      expect(adapter.compile).not.toHaveBeenCalled();
    });

    it('should report bodies it cannot read as undefined, and fall back to the default subject', async () => {
      const rendered = await service({
        defaults: { subject: 'Default subject', replyTo: 'default@x.com' },
      }).render({ text: { path: '/tmp/x.txt' }, replyTo: 'given@x.com' });

      expect(rendered.text).toBeUndefined();
      expect(rendered.subject).toBe('Default subject');
      expect(rendered.replyTo).toBe('given@x.com');
    });

    it('should reject when the template fails to compile', async () => {
      const adapter = {
        compile: (_mail: any, callback: (err?: Error) => void) =>
          callback(new Error('bad template')),
      };
      await expect(
        service({ template: { adapter } }).render({ template: 'x' }),
      ).rejects.toThrow('bad template');
    });

    it('should call the adapter when there is no body at all', async () => {
      const adapter = {
        compile: jest.fn((mail: any, callback: () => void) => {
          mail.data.html = '<p>generated</p>';
          callback();
        }),
      };
      await expect(
        service({ template: { adapter } }).render({ subject: 'x' }),
      ).resolves.toEqual(expect.objectContaining({ html: '<p>generated</p>' }));
    });
  });

  describe('compile plugin', () => {
    it('should skip the adapter for raw messages and text-only email', () => {
      const transporter = stub();
      const adapter = { compile: jest.fn() };
      new MailerService(
        { transport: 'smtp://x', template: { adapter } },
        factory(transporter),
      );
      const plugin = transporter.use.mock.calls.find(
        ([step]) => step === 'compile',
      )[1];

      for (const data of [{ raw: 'MIME' }, { text: 'plain' }]) {
        const callback = jest.fn();
        plugin({ data }, callback);
        expect(callback).toHaveBeenCalled();
      }
      expect(adapter.compile).not.toHaveBeenCalled();

      plugin({ data: { template: 'x', text: 'fallback' } }, jest.fn());
      expect(adapter.compile).toHaveBeenCalledTimes(1);
    });
  });

  describe('retries', () => {
    it('should retry transient failures, 3 attempts by default', async () => {
      jest.useFakeTimers();
      const sendMail = jest
        .fn()
        .mockRejectedValueOnce(fail({ code: 'ECONNECTION' }))
        .mockRejectedValueOnce(fail({ responseCode: 421 }))
        .mockResolvedValue({ messageId: 'ok' });
      const [eventService, emit] = events();
      const service = new MailerService(
        { transport: 'smtp://x' },
        factory(stub(sendMail)),
        eventService,
      );

      const pending = service.sendMail({ to: 'a@x.com' });
      await jest.runAllTimersAsync();

      await expect(pending).resolves.toEqual({ messageId: 'ok' });
      expect(sendMail).toHaveBeenCalledTimes(3);
      expect(eventNames(emit)).toEqual([
        MailerEvent.BEFORE_SEND,
        MailerEvent.RETRY,
        MailerEvent.RETRY,
        MailerEvent.AFTER_SEND,
      ]);
      expect(emit).toHaveBeenLastCalledWith(
        MailerEvent.AFTER_SEND,
        expect.objectContaining({ attempt: 3 }),
      );
    });

    it('should not hand delivery controls to nodemailer', async () => {
      const transporter = stub();
      const service = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(transporter),
      );

      await service.sendMail({
        to: 'a@x.com',
        retry: 2,
        signal: new AbortController().signal,
        failover: false,
      });

      const sent = transporter.sendMail.mock.calls[0][0];
      expect(sent).not.toHaveProperty('retry');
      expect(sent).not.toHaveProperty('signal');
      expect(sent).not.toHaveProperty('failover');
    });

    it('should fail at once on a permanent error', async () => {
      const rejection = fail({ responseCode: 550 }, '550 no such user');
      const sendMail = jest.fn().mockRejectedValue(rejection);
      const [eventService, emit] = events();
      const service = new MailerService(
        { transport: 'smtp://x', retry: 5 },
        factory(stub(sendMail)),
        eventService,
      );

      const failure = await service
        .sendMail({ to: 'a@x.com' })
        .catch((error: unknown) => error);
      // A typed error that keeps nodemailer's fields and the original
      expect(failure).toBeInstanceOf(MailerSmtpError);
      expect(failure).toMatchObject({
        message: '550 no such user',
        responseCode: 550,
        permanent: true,
        cause: rejection,
      });
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenLastCalledWith(
        MailerEvent.SEND_ERROR,
        expect.objectContaining({ attempt: 1, permanent: true }),
      );
    });

    it('should give up after the last attempt', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValue(fail({ code: 'ECONNECTION' }));
      const service = new MailerService(
        { transport: 'smtp://x', retry: { attempts: 2, ...fast } },
        factory(stub(sendMail)),
      );

      await expect(service.sendMail({})).rejects.toThrow('failed');
      expect(sendMail).toHaveBeenCalledTimes(2);
    });

    it('should let retryIf narrow what is retried', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValue(fail({ code: 'ECONNECTION' }));
      const retryIf = jest.fn(() => false);
      const service = new MailerService(
        { transport: 'smtp://x', retry: { attempts: 3, retryIf, ...fast } },
        factory(stub(sendMail)),
      );

      await expect(service.sendMail({})).rejects.toThrow();
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(retryIf).toHaveBeenCalledWith(expect.any(Error), 1);
    });

    it('should take a per-send retry over the module one', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValueOnce(fail({ code: 'ECONNECTION' }))
        .mockResolvedValue({ messageId: 'ok' });
      const service = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(stub(sendMail)),
      );

      await service.sendMail({ retry: { attempts: 2, ...fast } });
      expect(sendMail).toHaveBeenCalledTimes(2);
    });

    it('should validate the module retry option at startup', () => {
      expect(
        () =>
          new MailerService(
            { transport: 'smtp://x', retry: { attempts: 0 } },
            factory(),
          ),
      ).toThrow('retry.attempts must be a whole number');
    });

    it('should not resend after its own timeout without a stable Message-ID', async () => {
      jest.useFakeTimers();
      const sendMail = jest.fn(() => new Promise(() => undefined));
      const service = new MailerService(
        {
          transport: 'smtp://x',
          sendTimeout: 100,
          retry: { attempts: 3, ...fast },
        },
        factory(stub(sendMail)),
      );

      const outcome = expect(service.sendMail({})).rejects.toBeInstanceOf(
        MailerTimeoutError,
      );
      await jest.advanceTimersByTimeAsync(100);
      await outcome;
      // The first send may still deliver: a second one could duplicate it
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('should retry after its own timeout with an idempotency key', async () => {
      jest.useFakeTimers();
      const sendMail = jest
        .fn()
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValue({ messageId: 'ok' });
      const service = new MailerService(
        {
          transport: 'smtp://x',
          sendTimeout: 100,
          retry: { attempts: 2, ...fast },
        },
        factory(stub(sendMail)),
      );

      const pending = service.sendMail({ idempotencyKey: 'order-1' });
      await jest.advanceTimersByTimeAsync(200);
      await expect(pending).resolves.toEqual({ messageId: 'ok' });
      expect(sendMail).toHaveBeenCalledTimes(2);
    });

    it('should not resend a connection dropped while sending the message', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValue(fail({ code: 'ECONNRESET', command: 'DATA' }));
      const service = new MailerService(
        {
          transports: { backup: 'smtp://b' },
          transport: 'smtp://x',
          failover: ['backup'],
          retry: { attempts: 3, ...fast },
        },
        factory(stub(jest.fn()), stub(sendMail)),
      );

      await expect(service.sendMail({})).rejects.toBeInstanceOf(
        MailerConnectionError,
      );
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('should retry a connection dropped before the message was sent', async () => {
      const sendMail = jest
        .fn()
        .mockRejectedValueOnce(fail({ code: 'ECONNRESET', command: 'RCPT TO' }))
        .mockResolvedValue({ messageId: 'ok' });
      const service = new MailerService(
        { transport: 'smtp://x', retry: { attempts: 2, ...fast } },
        factory(stub(sendMail)),
      );

      await expect(service.sendMail({})).resolves.toEqual({ messageId: 'ok' });
    });
  });

  describe('abort signal', () => {
    it('should not send when the signal is already aborted', async () => {
      const transporter = stub();
      const [eventService, emit] = events();
      const service = new MailerService(
        { transport: 'smtp://x' },
        factory(transporter),
        eventService,
      );
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));

      await expect(
        service.sendMail({ signal: controller.signal }),
      ).rejects.toThrow('cancelled');
      expect(transporter.sendMail).not.toHaveBeenCalled();
      expect(emit).toHaveBeenLastCalledWith(
        MailerEvent.SEND_ERROR,
        expect.objectContaining({ attempt: 0 }),
      );
    });

    it('should stop waiting for a send in flight', async () => {
      const service = new MailerService(
        { transport: 'smtp://x' },
        factory(stub(jest.fn(() => new Promise(() => undefined)))),
      );
      const controller = new AbortController();

      const pending = service.sendMail({ signal: controller.signal });
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort(new Error('cancelled'));

      await expect(pending).rejects.toThrow('cancelled');
    });

    it('should stop retrying when aborted between attempts', async () => {
      jest.useFakeTimers();
      const sendMail = jest
        .fn()
        .mockRejectedValue(fail({ code: 'ECONNECTION' }));
      const service = new MailerService(
        { transport: 'smtp://x', retry: { attempts: 5 } },
        factory(stub(sendMail)),
      );
      const controller = new AbortController();

      const pending = service.sendMail({ signal: controller.signal });
      const outcome = expect(pending).rejects.toThrow('cancelled');
      await jest.advanceTimersByTimeAsync(0);
      controller.abort(new Error('cancelled'));
      await outcome;
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('should not retry when the send fails after an abort', async () => {
      const controller = new AbortController();
      const sendMail = jest.fn(async () => {
        controller.abort(new Error('cancelled'));
        throw fail({ code: 'ECONNECTION' });
      });
      const service = new MailerService(
        { transport: 'smtp://x', retry: 3 },
        factory(stub(sendMail)),
      );

      await expect(
        service.sendMail({ signal: controller.signal }),
      ).rejects.toThrow('cancelled');
      expect(sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('failover', () => {
    function setup(
      primary: jest.Mock,
      backup: jest.Mock = jest.fn(async () => ({ messageId: 'backup' })),
      options: Partial<MailerOptions> = {},
    ) {
      const [eventService, emit] = events();
      // Named transports are created before the default one
      const service = new MailerService(
        {
          transports: { backup: 'smtp://backup' },
          transport: 'smtp://primary',
          failover: ['backup'],
          retry: false,
          ...options,
        } as MailerOptions,
        factory(stub(backup), stub(primary)),
        eventService,
      );
      return { service, emit, backup };
    }

    it('should try the next transporter when one fails', async () => {
      const { service, emit, backup } = setup(
        jest.fn().mockRejectedValue(fail({ code: 'ECONNECTION' })),
      );

      await expect(service.sendMail({ to: 'a@x.com' })).resolves.toEqual({
        messageId: 'backup',
      });
      expect(backup).toHaveBeenCalled();
      expect(eventNames(emit)).toEqual([
        MailerEvent.BEFORE_SEND,
        MailerEvent.FAILOVER,
        MailerEvent.AFTER_SEND,
      ]);
      expect(emit).toHaveBeenLastCalledWith(
        MailerEvent.AFTER_SEND,
        expect.objectContaining({ transporterName: 'backup' }),
      );
    });

    it('should fail over on bad credentials', async () => {
      const { service, backup } = setup(
        jest.fn().mockRejectedValue(fail({ code: 'EAUTH', responseCode: 535 })),
      );
      await service.sendMail({});
      expect(backup).toHaveBeenCalled();
    });

    it('should not fail over when the message itself is rejected', async () => {
      const { service, backup } = setup(
        jest.fn().mockRejectedValue(fail({ responseCode: 550 })),
      );
      await expect(service.sendMail({})).rejects.toThrow();
      expect(backup).not.toHaveBeenCalled();
    });

    it('should throw the last error when every transporter fails', async () => {
      const { service } = setup(
        jest.fn().mockRejectedValue(fail({ code: 'ECONNECTION' }, 'primary')),
        jest.fn().mockRejectedValue(fail({ code: 'ECONNECTION' }, 'backup')),
      );
      await expect(service.sendMail({})).rejects.toThrow('backup');
    });

    it('should be turned off per send, and skip the selected transporter', async () => {
      const primary = jest
        .fn()
        .mockRejectedValue(fail({ code: 'ECONNECTION' }));
      const { service, backup } = setup(primary);

      await expect(service.sendMail({ failover: false })).rejects.toThrow();
      expect(backup).not.toHaveBeenCalled();

      backup.mockRejectedValue(fail({ code: 'ECONNECTION' }));
      await expect(
        service.sendMail({ transporterName: 'backup', failover: ['backup'] }),
      ).rejects.toThrow();
      expect(backup).toHaveBeenCalledTimes(1);
    });

    it('should not fail over after an abort', async () => {
      const controller = new AbortController();
      const { service, backup } = setup(
        jest.fn(async () => {
          controller.abort(new Error('cancelled'));
          throw fail({ code: 'ECONNECTION' });
        }),
      );
      await expect(
        service.sendMail({ signal: controller.signal }),
      ).rejects.toThrow('cancelled');
      expect(backup).not.toHaveBeenCalled();
    });

    it('should fail over from a named transporter, without an event service', async () => {
      const first = jest.fn().mockRejectedValue(fail({ code: 'ECONNECTION' }));
      const second = jest.fn(async () => ({ messageId: 'second' }));
      const service = new MailerService(
        {
          transports: { first: 'smtp://1', second: 'smtp://2' },
          failover: ['second'],
          retry: false,
        },
        factory(stub(first), stub(second)),
      );

      await expect(
        service.sendMail({ transporterName: 'first' }),
      ).resolves.toEqual({ messageId: 'second' });
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        "Transporter 'first' failed (failed), trying 'second'",
      );
    });

    it('should report a failover transporter that is not configured', async () => {
      const { service } = setup(jest.fn(), undefined, { failover: ['nope'] });
      await expect(service.sendMail({})).rejects.toThrow(
        'Failover transporter "nope" is not configured in `transports`',
      );
    });

    it('should work without failover configured', async () => {
      const { service } = setup(
        jest.fn(async () => ({ messageId: 'primary' })),
        undefined,
        { failover: undefined },
      );
      await expect(service.sendMail({})).resolves.toEqual({
        messageId: 'primary',
      });
    });
  });

  describe('delivery rules', () => {
    function setup(options: Partial<MailerOptions> = {}) {
      const transporter = stub();
      const [eventService, emit] = events();
      const service = new MailerService(
        { transport: 'smtp://x', retry: false, ...options } as MailerOptions,
        factory(transporter),
        eventService,
      );
      const sent = () => transporter.sendMail.mock.calls.at(-1)?.[0];
      return { service, emit, transporter, sent };
    }

    it('should derive a stable Message-ID from the idempotency key', async () => {
      const { service, sent } = setup({
        defaults: { from: 'shop@example.com' },
      });

      await service.sendMail({ idempotencyKey: 'order-1' });
      const first = sent().messageId;
      await service.sendMail({
        idempotencyKey: 'order-1',
        from: 'x@other.com',
      });

      expect(first).toMatch(/^<[0-9a-f]{32}@example\.com>$/);
      expect(sent().messageId).toMatch(/@other\.com>$/);
      expect(sent().messageId.split('@')[0]).toBe(first.split('@')[0]);
    });

    it('should keep an explicit Message-ID, and work without defaults', async () => {
      const { service, sent } = setup();

      await service.sendMail({ idempotencyKey: 'k', messageId: '<mine@x>' });
      expect(sent().messageId).toBe('<mine@x>');

      await service.sendMail({ idempotencyKey: 'k' });
      expect(sent().messageId).toMatch(/@nestjs-mailer\.local>$/);
    });

    it('should drop suppressed recipients and report them', async () => {
      const { service, emit, sent } = setup({
        suppress: (address) => address === 'bounced@x.com',
      });

      await service.sendMail({ to: ['bounced@x.com', 'ok@x.com'] });

      expect(sent().to).toEqual(['ok@x.com']);
      expect(emit).toHaveBeenCalledWith(
        MailerEvent.SUPPRESSED,
        expect.objectContaining({ suppressed: ['bounced@x.com'] }),
      );
    });

    it('should not send when every recipient is suppressed', async () => {
      const { service, emit, transporter } = setup({ suppress: () => true });

      await expect(service.sendMail({ to: 'a@x.com' })).resolves.toEqual({
        messageId: undefined,
        accepted: [],
        rejected: [],
        suppressed: ['a@x.com'],
        response: 'Not sent: every recipient is suppressed',
      });
      expect(transporter.sendMail).not.toHaveBeenCalled();
      expect(eventNames(emit)).toEqual([MailerEvent.SUPPRESSED]);
    });

    it('should report suppressions without an event service', async () => {
      const service = new MailerService(
        { transport: 'smtp://x', suppress: () => true },
        factory(),
      );
      await expect(service.sendMail({ to: 'a@x.com' })).resolves.toEqual(
        expect.objectContaining({ suppressed: ['a@x.com'] }),
      );
    });

    it('should intercept recipients', async () => {
      const { service, sent } = setup({
        intercept: { to: 'qa@company.com', subjectPrefix: '[QA] ' },
      });

      await service.sendMail({ to: 'customer@gmail.com', subject: 'Hi' });

      expect(sent()).toEqual(
        expect.objectContaining({
          to: ['qa@company.com'],
          subject: '[QA] Hi',
        }),
      );
    });

    it('should add one-click unsubscribe headers', async () => {
      const { service, sent } = setup();

      await service.sendMail({
        to: 'a@x.com',
        unsubscribe: { url: 'https://x.com/u/1' },
      });

      expect(sent()).toEqual(
        expect.objectContaining({
          list: { unsubscribe: ['https://x.com/u/1'] },
          headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      );
      expect(sent()).not.toHaveProperty('unsubscribe');
    });
  });

  describe('i18n', () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-i18n-'));
      fs.mkdirSync(path.join(dir, 'es'));
      fs.writeFileSync(path.join(dir, 'es', 'welcome.hbs'), 'Hola');
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("should fall back from a region to its language's template", async () => {
      const transporter = stub();
      const service = new MailerService(
        {
          transport: 'smtp://x',
          retry: false,
          template: { dir },
          i18n: { defaultLocale: 'en' },
        },
        factory(transporter),
      );

      await service.sendMail({ template: 'welcome', locale: 'es-CO' });

      expect(transporter.sendMail.mock.calls[0][0].template).toBe(
        path.join('es', 'welcome'),
      );
    });
  });

  describe('parity with @nestjs/mail', () => {
    async function testModule(options: Partial<MailerOptions> = {}) {
      const moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register(options as any)],
      }).compile();
      return {
        moduleRef,
        mailer: moduleRef.get(MailerService),
        mailbox: moduleRef.get(TestMailbox),
      };
    }

    it('should derive the text part from the HTML, after templates', async () => {
      const { moduleRef, mailer, mailbox } = await testModule({
        template: {
          adapter: {
            compile: (mail: any, callback: () => void) => {
              mail.data.html = '<p>Hi <a href="https://x.com/v">verify</a></p>';
              callback();
            },
          },
        },
      });

      await mailer.sendMail({ to: 'a@x.com', template: 'welcome' });
      await mailer.sendMail({
        to: 'a@x.com',
        html: Buffer.from('<p>Buffer</p>'),
      });
      await mailer.sendMail({
        to: 'a@x.com',
        html: '<p>Html</p>',
        text: 'Given',
      });

      expect(mailbox.mails.map((m) => m.text)).toEqual([
        'Hi verify (https://x.com/v)',
        'Buffer',
        'Given',
      ]);
      await moduleRef.close();
    });

    it('should leave the text part out when asked, or when there is no HTML', async () => {
      const { moduleRef, mailer, mailbox } = await testModule({
        textFromHtml: false,
      });
      await mailer.sendMail({ to: 'a@x.com', html: '<p>Html</p>' });
      expect(mailbox.last?.text).toBeUndefined();
      await moduleRef.close();

      const other = await testModule();
      await other.mailer.sendMail({ to: 'a@x.com', subject: 'No body' });
      await other.mailer.sendMail({ to: 'a@x.com', html: '' });
      expect(other.mailbox.mails.map((m) => m.text)).toEqual([
        undefined,
        undefined,
      ]);
      await other.moduleRef.close();
    });

    it('should not add a text part to raw messages', async () => {
      const transporter = stub();
      new MailerService({ transport: 'smtp://x' }, factory(transporter));
      const plugin = transporter.use.mock.calls.find(
        ([step]) => step === 'compile',
      )[1];
      const data = { raw: 'MIME', html: '<p>x</p>' };
      const callback = jest.fn();
      plugin({ data }, callback);
      expect(data).not.toHaveProperty('text');
      expect(callback).toHaveBeenCalled();
    });

    it('should send HTML built with the html tag, or any SafeHtml-like object', async () => {
      const { moduleRef, mailer, mailbox } = await testModule();
      const name = '<script>';

      await mailer.sendMail({ to: 'a@x.com', html: html`<p>${name}</p>` });
      await mailer.sendMail({
        to: 'a@x.com',
        html: { toString: () => '<p>official</p>' },
      });

      expect(mailbox.mails.map((m) => m.html)).toEqual([
        '<p>&lt;script&gt;</p>',
        '<p>official</p>',
      ]);
      await moduleRef.close();
    });

    it('should reject an invalid message before sending', async () => {
      const transporter = stub();
      const [eventService, emit] = events();
      const service = new MailerService(
        { transport: 'smtp://x' },
        factory(transporter),
        eventService,
      );

      await expect(
        service.sendMail({ to: 'not-an-address', subject: 'x' }),
      ).rejects.toBeInstanceOf(MailerMessageError);
      expect(transporter.sendMail).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('should skip validation when asked, and for raw messages', async () => {
      const transporter = stub();
      const service = new MailerService(
        { transport: 'smtp://x', validate: false, retry: false },
        factory(transporter),
      );
      await service.sendMail({ to: 'not-an-address' });

      const validating = new MailerService(
        { transport: 'smtp://x', retry: false },
        factory(transporter),
      );
      await validating.sendMail({
        raw: 'MIME',
        envelope: { from: 'a', to: ['b'] },
      });
      expect(transporter.sendMail).toHaveBeenCalledTimes(2);
    });

    it('should rethrow transport errors as they are with wrapErrors: false', async () => {
      const rejection = fail({ responseCode: 550 });
      const service = new MailerService(
        { transport: 'smtp://x', wrapErrors: false },
        factory(stub(jest.fn().mockRejectedValue(rejection))),
      );
      await expect(service.sendMail({})).rejects.toBe(rejection);
    });

    it('should report template failures as MailerTemplateError', async () => {
      const { moduleRef, mailer } = await testModule({
        template: {
          adapter: {
            compile: (_mail: any, callback: (error: Error) => void) =>
              callback(new Error('ENOENT: no such file')),
          },
        },
      });

      const failure = await mailer
        .sendMail({ to: 'a@x.com', template: 'missing' })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(MailerTemplateError);
      expect(failure).toMatchObject({
        template: 'missing',
        permanent: true,
        message: 'Template "missing" failed: ENOENT: no such file',
      });
      await moduleRef.close();
    });

    it('should describe template failures that are not errors', async () => {
      const { moduleRef, mailer } = await testModule({
        template: {
          adapter: {
            compile: (_mail: any, callback: (error: unknown) => void) =>
              callback('bad'),
          },
        },
      });
      await expect(
        mailer.sendMail({ to: 'a@x.com', template: 't' }),
      ).rejects.toThrow('Template "t" failed: bad');
      await moduleRef.close();
    });

    describe('shutdown', () => {
      it('should wait for the sends in flight before closing', async () => {
        let finish!: (info: unknown) => void;
        const close = jest.fn();
        const transporter = {
          ...stub(jest.fn(() => new Promise((resolve) => (finish = resolve)))),
          close,
        };
        const service = new MailerService(
          { transport: 'smtp://x', retry: false },
          factory(transporter),
        );

        const sending = service.sendMail({});
        await new Promise((resolve) => setImmediate(resolve));
        const closing = service.onModuleDestroy();
        await new Promise((resolve) => setImmediate(resolve));
        expect(close).not.toHaveBeenCalled();

        finish({ messageId: 'late' });
        await expect(sending).resolves.toEqual({ messageId: 'late' });
        await closing;
        expect(close).toHaveBeenCalled();
      });

      it('should stop waiting after shutdownTimeout', async () => {
        jest.useFakeTimers();
        const service = new MailerService(
          { transport: 'smtp://x', retry: false, shutdownTimeout: 1000 },
          factory(stub(jest.fn(() => new Promise(() => undefined)))),
        );

        service.sendMail({});
        const draining = service.drain();
        await jest.advanceTimersByTimeAsync(1000);
        await draining;
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
          'Closing with 1 email(s) still sending after 1000ms',
        );
      });

      it('should return at once with nothing in flight, and forget settled sends', async () => {
        const service = new MailerService(
          { transport: 'smtp://x', retry: false },
          factory(
            stub(jest.fn().mockRejectedValue(fail({ responseCode: 550 }))),
          ),
        );
        await expect(service.sendMail({})).rejects.toThrow();
        await expect(service.drain()).resolves.toBeUndefined();
        await expect(service.drain(5)).resolves.toBeUndefined();
      });
    });

    describe('local transports in production', () => {
      const env = process.env.NODE_ENV;
      afterEach(() => {
        process.env.NODE_ENV = env;
      });

      it('should warn when a transport never delivers', () => {
        process.env.NODE_ENV = 'production';
        new MailerService({
          transport: new LogTransport(),
          transports: { files: new FileTransport(), smtp: 'smtp://x' },
        });
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
          '`transport` is LogTransport, which doesn\'t deliver email, and NODE_ENV is "production".',
        );
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
          '`transports.files` is FileTransport, which doesn\'t deliver email, and NODE_ENV is "production".',
        );
        expect(Logger.prototype.warn).toHaveBeenCalledTimes(2);
      });

      it('should check named transports alone, or a default transport alone', () => {
        process.env.NODE_ENV = 'production';
        new MailerService({ transports: { smtp: 'smtp://x' } });
        new MailerService({ transport: 'smtp://x' });
        expect(Logger.prototype.warn).not.toHaveBeenCalled();
      });

      it('should stay quiet outside production', () => {
        process.env.NODE_ENV = 'development';
        new MailerService({ transport: new LogTransport() });
        expect(Logger.prototype.warn).not.toHaveBeenCalled();
      });
    });

    describe('mail class dependencies', () => {
      @Injectable()
      class UsersService {
        name() {
          return 'Ada';
        }
      }

      @Module({ providers: [UsersService], exports: [UsersService] })
      class UsersModule {}

      const TOKEN = 'GREETING';

      @Injectable()
      class Personal implements Mailable<void> {
        constructor(
          private readonly users: UsersService,
          @Inject(TOKEN) private readonly greeting: string,
        ) {}

        render() {
          return {
            subject: `${this.greeting} ${this.users.name()}`,
            text: 'x',
          };
        }
      }

      it('should inject providers of non-global modules', async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [MailerTestModule.register(), UsersModule],
          providers: [{ provide: TOKEN, useValue: 'Hello' }],
        }).compile();

        await moduleRef.get(MailerService).send(Personal, { to: 'a@x.com' });

        expect(moduleRef.get(TestMailbox).last?.subject).toBe('Hello Ada');
        await moduleRef.close();
      });

      it('should explain a dependency that is not available', async () => {
        const moduleRef = await Test.createTestingModule({
          imports: [MailerTestModule.register()],
          providers: [{ provide: TOKEN, useValue: 'Hello' }],
        }).compile();

        await expect(
          moduleRef.get(MailerService).send(Personal, { to: 'a@x.com' }),
        ).rejects.toThrow(
          "Personal needs UsersService (constructor argument 0), which isn't available. Register Personal as a provider in the module that has UsersService.",
        );
        await moduleRef.close();
      });

      it('should name token dependencies, and create classes without metadata', async () => {
        @Injectable()
        class NeedsToken implements Mailable<void> {
          constructor(@Inject('MISSING') readonly value: string) {}
          render() {
            return { subject: 'x' };
          }
        }
        const moduleRef = await Test.createTestingModule({
          imports: [MailerTestModule.register()],
        }).compile();
        const mailer = moduleRef.get(MailerService);

        await expect(
          mailer.send(NeedsToken, { to: 'a@x.com' }),
        ).rejects.toThrow('NeedsToken needs MISSING (constructor argument 0)');

        class Bare {
          render() {
            return { subject: 'Bare', text: 'x' };
          }
        }
        await mailer.send(Bare, { to: 'a@x.com' });
        expect(moduleRef.get(TestMailbox).last?.subject).toBe('Bare');
        await moduleRef.close();
      });
    });

    it('should find localized templates in every template directory', async () => {
      const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-dirs-'));
      fs.mkdirSync(path.join(extra, 'fr'));
      fs.writeFileSync(path.join(extra, 'fr', 'welcome.hbs'), 'Bonjour');
      const transporter = stub();
      const service = new MailerService(
        {
          transport: 'smtp://x',
          retry: false,
          template: { dir: os.tmpdir(), dirs: [extra] },
          i18n: { defaultLocale: 'en' },
        },
        factory(transporter),
      );

      await service.sendMail({ template: 'welcome', locale: 'fr' });

      expect(transporter.sendMail.mock.calls[0][0].template).toBe(
        path.join('fr', 'welcome'),
      );
      fs.rmSync(extra, { recursive: true, force: true });
    });

    it('should throw the abort reason as it is', async () => {
      const controller = new AbortController();
      const reason = new Error('cancelled');
      const service = new MailerService(
        { transport: 'smtp://x' },
        factory(
          stub(
            jest.fn(async () => {
              controller.abort(reason);
              throw fail({ code: 'ECONNECTION' });
            }),
          ),
        ),
      );
      await expect(
        service.sendMail({ signal: controller.signal }),
      ).rejects.toBe(reason);
    });
  });
});
