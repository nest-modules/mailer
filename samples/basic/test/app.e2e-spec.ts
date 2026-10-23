import { MAILER_OPTIONS, MailerOptions, TestMailbox } from '@nestjs-modules/mailer';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const mailbox = new TestMailbox();

  beforeEach(async () => {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    // Keep the app's options (templates, defaults) but capture the email
    // instead of sending it through the real SMTP server
    const probe = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const options = probe.get<MailerOptions>(MAILER_OPTIONS);
    await probe.close();
    const moduleFixture: TestingModule = await builder
      .overrideProvider(MAILER_OPTIONS)
      .useValue({ ...options, transport: mailbox, retry: false })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    mailbox.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) sends an inline email', async () => {
    await request(app.getHttpServer()).get('/').expect(200);

    const mail = mailbox.assertSent({ to: 'user@gmail.com' });
    expect(mail.html).toBe('<b>welcome</b>');
  });

  it('/template (GET) renders the Handlebars template', async () => {
    await request(app.getHttpServer()).get('/template').expect(200);

    const mail = mailbox.assertSent({ template: 'index' });
    expect(mail.html).toContain('cf1a3f828287');
    expect(mail.html).toContain('john doe');
  });
});
