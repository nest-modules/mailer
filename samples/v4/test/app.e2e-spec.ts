import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerModule, MailerService } from '@nestjs-modules/mailer';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

describe('v4 example (e2e)', () => {
  let app: INestApplication;
  let mailDir: string;

  beforeAll(async () => {
    mailDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-v4-'));
    process.env.MAIL_DIR = mailDir;
    // Loaded after MAIL_DIR is set: the module reads it when it's imported
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(mailDir, { recursive: true, force: true });
  });

  it('lists the previews with links that keep the global prefix', async () => {
    const res = await request(app.getHttpServer()).get('/api/_mailer').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('href="/api/_mailer/welcome"');
    expect(res.text).toContain('Sent after sign-up');
  });

  it('renders a mail class with inline images embedded', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/_mailer/welcome')
      .expect(200);
    expect(res.text).toContain('<h1>Welcome, Ada!</h1>');
    expect(res.text).toContain('src="data:image/svg+xml;base64,');
    expect(res.text).not.toContain('cid:logo');
  });

  it('renders the localized template and the text version', async () => {
    const es = await request(app.getHttpServer())
      .get('/api/_mailer/welcome-es')
      .expect(200);
    expect(es.text).toContain('¡Bienvenido, Ada!');

    const region = await request(app.getHttpServer())
      .get('/api/_mailer/welcome?locale=es-CO')
      .expect(200);
    expect(region.text).toContain('¡Bienvenido, Ada!');

    await request(app.getHttpServer()).get('/api/_mailer/welcome/text').expect(200);
    await request(app.getHttpServer()).get('/api/_mailer/missing').expect(404);
  });

  it('sends a mail class through the file transport', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/signup')
      .send({ email: 'ada@example.com', name: 'Ada' })
      .expect(201);
    expect(res.body.messageId).toMatch(/@example\.com>$/);

    const files = fs.readdirSync(mailDir);
    const eml = files.find((f) => f.endsWith('.eml'))!;
    expect(files.some((f) => f.endsWith('.html'))).toBe(true);
    const raw = fs.readFileSync(path.join(mailDir, eml), 'utf-8');
    expect(raw).toContain('Subject: Welcome, Ada');
    expect(raw).toContain(`Message-ID: ${res.body.messageId}`);
  });

  it('keeps the same Message-ID for a redelivered signup', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/api/signup')
        .send({ email: 'bob@example.com', name: 'Bob' });
    const [first, second] = [await send(), await send()];
    expect(first.body.messageId).toBe(second.body.messageId);
  });

  it('exposes the mailer to other modules', () => {
    expect(app.get(MailerService)).toBeDefined();
    expect(MailerModule).toBeDefined();
  });
});
