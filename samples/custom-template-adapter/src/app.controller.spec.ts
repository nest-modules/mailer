import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { MailerTestModule, TestMailbox } from '@nestjs-modules/mailer';
import { EtaAdapter } from './adapters/eta.adapter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let mailbox: TestMailbox;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        // Captures emails in memory, rendered with the custom adapter
        MailerTestModule.register({
          template: {
            dir: join(__dirname, '..', 'templates'),
            adapter: new EtaAdapter(),
          },
        }),
      ],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get(AppController);
    mailbox = app.get(TestMailbox);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });

    it('should send the email rendered by the Eta adapter', async () => {
      await appController.sendEmail();

      const mail = mailbox.assertSent({
        to: 'user@gmail.com',
        template: 'index',
      });
      expect(mail.html).toContain('Context Code : cf1a3f828287');
    });
  });
});
