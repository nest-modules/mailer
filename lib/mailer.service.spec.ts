import { Test, TestingModule } from "@nestjs/testing";
import MailMessage = require('nodemailer/lib/mailer/mail-message');
import SMTPTransport = require('nodemailer/lib/smtp-transport');
import { MAILER_OPTIONS } from "./constants/mailer-options.constant";
import { MailerOptions } from "./interfaces/mailer-options.interface";
import { MailerService } from "./mailer.service";
import { HandlebarsAdapter } from './adapters/handlebars.adapter';
import { PugAdapter } from './adapters/pug.adapter';

/**
 * Common testing code for testing up a testing module and MailerService
 */
async function getMailerServiceForOptions(
  options: MailerOptions
): Promise<MailerService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        name: MAILER_OPTIONS,
        provide: MAILER_OPTIONS,
        useValue: options
      },
      MailerService
    ]
  }).compile();

  const service = module.get<MailerService>(MailerService);

  return service;
}

/**
 * Common testing code for spying on the SMTPTransport's send() implementation
 */
function spyOnSmtpSend(onMail: (mail: MailMessage) => void) {
  return jest.spyOn(SMTPTransport.prototype, 'send').mockImplementation(function (mail: MailMessage, callback: (err: Error | null, info: SMTPTransport.SentMessageInfo) => void): void {
    onMail(mail);
    callback(null, {
      envelope: {
        from: mail.data.from as string,
        to: [mail.data.to as string]
      },
      messageId: 'ABCD'
    });
  });
}

describe("MailerService", () => {
  it("should not be defined if a transport is not provided", async () => {
    await expect(getMailerServiceForOptions({})).rejects.toMatchInlineSnapshot(
      `[Error: Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.]`
    );
  });

  it("should accept a smtp transport string", async () => {
    const service = await getMailerServiceForOptions({
      transport: "smtps://user@domain.com:pass@smtp.domain.com"
    });

    expect(service).toBeDefined();
    expect((service as any).transporter.transporter).toBeInstanceOf(SMTPTransport);
  });

  it("should accept smtp transport options", async () => {
    const service = await getMailerServiceForOptions({
      transport: {
        secure: true,
        auth: {
          user: 'user@domain.com',
          pass: 'pass',
        },
        options: {
          host: 'smtp.domain.com',
        },
      }
    });

    expect(service).toBeDefined();
    expect((service as any).transporter.transporter).toBeInstanceOf(SMTPTransport);
  });


  it("should accept a smtp transport instance", async () => {
    const transport = new SMTPTransport({})
    const service = await getMailerServiceForOptions({
      transport: transport
    });

    expect(service).toBeDefined();
    expect((service as any).transporter.transporter).toBe(transport);
  });

  it('should send emails with nodemailer', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: "smtps://user@domain.com:pass@smtp.domain.com"
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      html: 'This is test.'
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.to).toBe('user2@example.test');
    expect(lastMail.data.subject).toBe('Test');
    expect(lastMail.data.html).toBe('This is test.');
  });

  it('should use mailerOptions.defaults when send emails', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: "smtps://user@domain.com:pass@smtp.domain.com",
      defaults: {
        from: 'user1@example.test'
      }
    });

    await service.sendMail({
      to: 'user2@example.test',
      subject: 'Test',
      html: 'This is test.'
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
  });

  it('should compile template with the handlebars adapter', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: new SMTPTransport({}),
      template: {
        adapter: new HandlebarsAdapter(),
      }
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/handlebars-template',
      context: {
        world: 'World',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toBe('<p>Handlebars test template.</p>\n<p>Hello World!</p>\n');
  });

  it('should compile template with the pug adapter', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: new SMTPTransport({}),
      template: {
        adapter: new PugAdapter(),
      }
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/pug-template',
      context: {
        world: 'World',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toBe('<p>Pug test template.</p><p>Hello World!</p>');
  });
});
