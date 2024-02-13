import { Test, TestingModule } from '@nestjs/testing';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as nodemailerMock from 'nodemailer-mock';

import MailMessage from 'nodemailer/lib/mailer/mail-message';

import {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';
import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { MailerService } from './mailer.service';
import { HandlebarsAdapter } from './adapters/handlebars.adapter';
import { PugAdapter } from './adapters/pug.adapter';
import { EjsAdapter } from './adapters/ejs.adapter';

/**
 * Common testing code for testing up a testing module and MailerService
 */
async function getMailerServiceForOptions(
  options: MailerOptions,
): Promise<MailerService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        name: MAILER_OPTIONS,
        provide: MAILER_OPTIONS,
        useValue: options,
      },
      MailerService,
    ],
  }).compile();

  const service = module.get<MailerService>(MailerService);
  return service;
}

/**
 * Common testing code for spying on the SMTPTransport's send() implementation
 */
function spyOnSmtpSend(onMail: (mail: MailMessage) => void) {
  return jest
    .spyOn(SMTPTransport.prototype, 'send')
    .mockImplementation(function (
      mail: MailMessage,
      callback: (
        err: Error | null,
        info: SMTPTransport.SentMessageInfo,
      ) => void,
    ): void {
      onMail(mail);
      callback(null, {
        envelope: {
          from: mail.data.from as string,
          to: [mail.data.to as string],
        },
        messageId: 'ABCD',
        accepted: [],
        rejected: [],
        pending: [],
        response: 'ok',
      });
    });
}

async function getMailerServiceWithCustomTransport(
  options: MailerOptions,
): Promise<MailerService> {
  class TestTransportFactory implements MailerTransportFactory {
    createTransport(options?: TransportType) {
      return nodemailerMock.createTransport({ host: 'localhost', port: -100 });
    }
  }
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        name: MAILER_OPTIONS,
        provide: MAILER_OPTIONS,
        useValue: options,
      },
      {
        name: MAILER_TRANSPORT_FACTORY,
        provide: MAILER_TRANSPORT_FACTORY,
        useClass: TestTransportFactory,
      },
      MailerService,
    ],
  }).compile();
  await module.init();

  const service = module.get<MailerService>(MailerService);
  return service;
}

describe('MailerService', () => {
  it('should not be defined if a transport is not provided', async () => {
    await expect(getMailerServiceForOptions({})).rejects.toMatchInlineSnapshot(
      `[Error: Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.]`,
    );
  });

  it('should accept a smtp transport string', async () => {
    const service = await getMailerServiceForOptions({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
    });

    expect(service).toBeDefined();
    expect((service as any).transporter.transporter).toBeInstanceOf(
      SMTPTransport,
    );
  });

  it('should accept smtp transport options', async () => {
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
      },
    });

    expect(service).toBeDefined();
    expect((service as any).transporter.transporter).toBeInstanceOf(
      SMTPTransport,
    );
  });

  it('should accept a smtp transport instance', async () => {
    const transport = new SMTPTransport({});
    const service = await getMailerServiceForOptions({
      transport: transport,
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
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      html: 'This is test.',
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
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from: 'user1@example.test',
      },
    });

    await service.sendMail({
      to: 'user2@example.test',
      subject: 'Test',
      html: 'This is test.',
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
      },
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/handlebars-template',
      context: {
        MAILER: 'Nest-modules TM',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toBe(
      '<html><head></head><body><p>Handlebars test template. by Nest-modules TM</p></body></html>',
    );
  });

  it('should compile template with the handlebars adapter with disabled css-inline', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: new SMTPTransport({}),
      template: {
        adapter: new HandlebarsAdapter(undefined, { inlineCssEnabled: false }),
      },
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/handlebars-template-media-query',
      context: {
        MAILER: 'Nest-modules TM',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toContain(
      '@media only screen and (max-width:350px)',
    );
    expect(lastMail.data.html).toContain(
      '<p>Handlebars test template. by Nest-modules TM</p>',
    );
  });

  it('should compile template with the handlebars adapter with enabled css-inline and media query', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: new SMTPTransport({}),
      template: {
        adapter: new HandlebarsAdapter(undefined, {
          inlineCssEnabled: true,
          inlineCssOptions: { },
        }),
      },
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/handlebars-template-media-query',
      context: {
        MAILER: 'Nest-modules TM',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toContain(
      '@media only screen and (max-width:350px)',
    );
    expect(lastMail.data.html?.toString().replace(/\n/g, '')).toContain(
      `<html><head><style data-css-inline=\"keep\" type=\"text/css\">  @media only screen and (max-width:350px) { p { font-size: 20px; } }</style></head><body><p>Handlebars test template. by Nest-modules TM</p></body></html>`
    );
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
      },
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
    expect(lastMail.data.html).toBe(
      '<html><head></head><body><p>Pug test template.</p><p>Hello World!</p></body></html>',
    );
  });

  it('should compile template with the ejs adapter', async () => {
    let lastMail: MailMessage;
    const send = spyOnSmtpSend((mail: MailMessage) => {
      lastMail = mail;
    });

    const service = await getMailerServiceForOptions({
      transport: new SMTPTransport({}),
      template: {
        adapter: new EjsAdapter(),
      },
    });

    await service.sendMail({
      from: 'user1@example.test',
      to: 'user2@example.test',
      subject: 'Test',
      template: __dirname + '/test-templates/ejs-template',
      context: {
        MAILER: 'Nest-modules TM',
      },
    });

    expect(send).toHaveBeenCalled();
    expect(lastMail.data.from).toBe('user1@example.test');
    expect(lastMail.data.html).toBe(
      '<html><head></head><body><p>Ejs test template. by Nest-modules TM</p></body></html>',
    );
  });

  it('should use custom transport to send mail', async () => {
    const service = await getMailerServiceWithCustomTransport({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
    });
    await service.sendMail({
      to: 'user2@example.test',
      subject: 'Test',
      html: 'This is test.',
    });

    expect(nodemailerMock.mock.getSentMail().length).toEqual(1);
  });
});
