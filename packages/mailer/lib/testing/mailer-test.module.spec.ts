import { GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { MAILER_OPTIONS } from '../constants/mailer.constant';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { MailerService } from '../mailer.service';
import { MailerBatchService } from '../mailer-batch.service';
import { MailerEventService } from '../mailer-event.service';
import { MailerTestModule } from './mailer-test.module';

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
      ]);
    });

    it('should provide services backed by a buffering stream transport', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register()],
      }).compile();

      expect(moduleRef.get(MAILER_OPTIONS)).toEqual({
        transport: { streamTransport: true, newline: 'unix', buffer: true },
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
      // `newline: 'unix'` means no CRLF line endings
      expect(raw).not.toContain('\r\n');
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
      expect(options.transport).toEqual({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
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
  });
});
