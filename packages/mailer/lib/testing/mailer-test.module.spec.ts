import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { MAILER_OPTIONS } from '../constants/mailer.constant';
import { Mailable } from '../interfaces/mailable.interface';
import {
  MailerOptions,
  MailerPlugin,
} from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { MailerService } from '../mailer.service';
import { MailerBatchService } from '../mailer-batch.service';
import { MailerEventService } from '../mailer-event.service';
import { TestMailbox } from '../transports/test-mailbox';
import { MailerTestModule } from './mailer-test.module';

@Injectable()
class WelcomeMail implements Mailable<{ name: string }> {
  render({ name }: { name: string }) {
    return {
      subject: `Welcome ${name}`,
      html: `<a href="https://app.test/verify?user=${name}">Verify</a>`,
    };
  }
}

class OtherMail implements Mailable {
  render() {
    return { subject: 'Other', text: 'Other' };
  }
}

describe('MailerTestModule', () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('should be declared as a global module', () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, MailerTestModule)).toBe(
      true,
    );
  });

  describe('register', () => {
    it('should describe a dynamic module exporting the mailer services', () => {
      const dynamicModule = MailerTestModule.register();

      expect(dynamicModule.module).toBe(MailerTestModule);
      expect(dynamicModule.exports).toEqual([
        MailerService,
        MailerBatchService,
        MailerEventService,
        TestMailbox,
      ]);
    });

    it('should provide services backed by the TestMailbox transport', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register()],
      }).compile();

      expect(moduleRef.get(MAILER_OPTIONS)).toEqual({
        retry: false,
        transport: moduleRef.get(TestMailbox),
      });
      expect(moduleRef.get(MailerBatchService)).toBeInstanceOf(
        MailerBatchService,
      );
      expect(moduleRef.get(MailerEventService)).toBeInstanceOf(
        MailerEventService,
      );

      const info = await moduleRef.get(MailerService).sendMail({
        from: 'sender@example.test',
        to: 'recipient@example.test',
        subject: 'Captured',
        text: 'Not delivered anywhere',
      });

      const raw = info.message.toString();
      expect(info.envelope).toEqual({
        from: 'sender@example.test',
        to: ['recipient@example.test'],
      });
      expect(raw).toContain('Subject: Captured');
      expect(raw).toContain('Not delivered anywhere');
      // The MIME source as it would go on the wire
      expect(raw).toContain('\r\n');
    });

    it('should capture stream attachments without consuming them twice', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register()],
      }).compile();

      const info = await moduleRef.get(MailerService).sendMail({
        to: 'ada@example.test',
        subject: 'Report',
        text: 'Attached',
        attachments: [
          { filename: 'report.txt', content: Readable.from(['streamed body']) },
        ],
      });

      const base64 = Buffer.from('streamed body').toString('base64');
      expect(info.message.toString()).toContain(base64);
      expect(moduleRef.get(TestMailbox).last?.raw).toContain(base64);
    });

    it('should merge the given template options with the test transport', async () => {
      const adapter: TemplateAdapter = {
        compile: jest.fn((mail, callback) => {
          mail.data.html = `<p>${mail.data.context.name}</p>`;
          callback();
        }),
      };

      moduleRef = await Test.createTestingModule({
        imports: [
          MailerTestModule.register({
            template: { dir: '/templates', adapter, options: { strict: true } },
          }),
        ],
      }).compile();

      const options = moduleRef.get<MailerOptions>(MAILER_OPTIONS);
      expect(options.transport).toBe(moduleRef.get(TestMailbox));
      expect(options.template).toEqual({
        dir: '/templates',
        adapter,
        options: { strict: true },
      });

      const info = await moduleRef.get(MailerService).sendMail({
        to: 'recipient@example.test',
        template: 'welcome',
        context: { name: 'Ana' },
      });

      expect(adapter.compile).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Function),
        options,
      );
      expect(info.message.toString()).toContain('<p>Ana</p>');
    });
    describe('TestMailbox', () => {
      it('should capture what MailerService sends', async () => {
        moduleRef = await Test.createTestingModule({
          imports: [MailerTestModule.register()],
        }).compile();
        const mailbox = moduleRef.get(TestMailbox);

        await moduleRef.get(MailerService).sendMail({
          from: 'sender@example.test',
          to: 'ada@example.test',
          subject: 'Hi',
          text: 'Hello',
        });

        const mail = mailbox.assertSent({
          to: 'ada@example.test',
          subject: 'Hi',
        });
        expect(mail.text).toBe('Hello');
        expect(mail.from).toBe('sender@example.test');
        mailbox.assertCount(1);
      });

      it('should capture emails sent with a mail class and match them by class', async () => {
        moduleRef = await Test.createTestingModule({
          imports: [MailerTestModule.register()],
        }).compile();
        const mailbox = moduleRef.get(TestMailbox);

        await moduleRef.get(MailerService).send(WelcomeMail, {
          to: 'ada@example.test',
          data: { name: 'Ada' },
        });

        const mail = mailbox.assertSent({ mail: WelcomeMail });
        expect(mail.mailable).toBe(WelcomeMail);
        expect(mail.subject).toBe('Welcome Ada');
        expect(mail.link('/verify').searchParams.get('user')).toBe('Ada');
        mailbox.assertNotSent({ mail: OtherMail });
      });

      it('should give each registered module its own mailbox', () => {
        const first = MailerTestModule.register();
        const second = MailerTestModule.register();
        const mailboxOf = (dynamicModule: typeof first) =>
          (dynamicModule.providers as any[]).find(
            (provider) => provider.provide === TestMailbox,
          ).useValue;

        expect(mailboxOf(first)).toBeInstanceOf(TestMailbox);
        expect(mailboxOf(first)).not.toBe(mailboxOf(second));
      });
    });

    it('should keep the given plugins', async () => {
      const userPlugin: MailerPlugin = {
        step: 'compile',
        plugin: jest.fn((mail, callback) => {
          mail.data.subject = `[test] ${mail.data.subject}`;
          callback();
        }),
      };
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register({ plugins: [userPlugin] })],
      }).compile();

      const options = moduleRef.get<MailerOptions>(MAILER_OPTIONS);
      expect(options.plugins).toEqual([userPlugin]);

      await moduleRef
        .get(MailerService)
        .sendMail({ to: 'ada@example.test', subject: 'Hi', text: 'x' });

      expect(userPlugin.plugin).toHaveBeenCalledTimes(1);
      moduleRef.get(TestMailbox).assertSent({ subject: '[test] Hi' });
    });

    it('should not retry a simulated failure by default', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register()],
      }).compile();
      const mailbox = moduleRef.get(TestMailbox);
      mailbox.failNext();

      await expect(
        moduleRef
          .get(MailerService)
          .sendMail({ to: 'ada@example.test', subject: 'Hi', text: 'x' }),
      ).rejects.toThrow('TestMailbox: simulated failure');
      mailbox.assertNotSent();
    });

    it('should retry when the test enables retries', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          MailerTestModule.register({
            retry: { attempts: 2, backoff: { delay: 0 } },
          }),
        ],
      }).compile();
      expect(moduleRef.get<MailerOptions>(MAILER_OPTIONS).retry).toEqual({
        attempts: 2,
        backoff: { delay: 0 },
      });
      const mailbox = moduleRef.get(TestMailbox);
      mailbox.failNext();

      await moduleRef
        .get(MailerService)
        .sendMail({ to: 'ada@example.test', subject: 'Hi', text: 'x' });

      mailbox.assertCount(1, { subject: 'Hi' });
    });
  });
});
