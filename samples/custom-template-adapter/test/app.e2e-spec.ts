import { MAILER_OPTIONS, MailerOptions, TestMailbox } from '@nestjs-modules/mailer';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  const mailbox = new TestMailbox();

  beforeEach(async () => {
    // Keep the app's options (the Eta adapter) but capture the email instead of
    // sending it to MailDev, so the test runs without Docker
    const probe = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const options = probe.get<MailerOptions>(MAILER_OPTIONS);
    await probe.close();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER_OPTIONS)
      .useValue({ ...options, transport: mailbox, retry: false })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(HttpStatus.OK)
      .expect('Hello World!');
  });

  it('/email (GET)', async () => {
    await request(app.getHttpServer())
      .get('/email')
      .expect(HttpStatus.OK);

    // Rendered by the custom Eta adapter
    const mail = mailbox.assertSent({ template: 'index' });
    expect(mail.html).toContain('Context Code : cf1a3f828287');
    expect(mail.html).toContain('Context Username: john doe');
  });
});
