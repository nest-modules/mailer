// Integration tests against the real, ESM-only `@nestjs/mail` package, run by
// Node's test runner (`node --test test/`) on the compiled output in `dist/`.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import { MailEvents, MailModule, Mailer } from '@nestjs/mail';
import { Test } from '@nestjs/testing';

const require = createRequire(import.meta.url);
const {
  MailerEventService,
  MailerModule,
  MailerService,
  MailerTestModule,
  TestMailbox,
} = require('../dist/index.js');
const {
  MailerServiceTransport,
  NodemailerMailTransport,
  TemplateAdapterEngine,
} = require('../dist/nestjs-mail/index.js');
const { HandlebarsAdapter } = require('../dist/adapters/handlebars.adapter.js');

const templatesDir = fileURLToPath(
  new URL('../lib/test-templates/nestjs-mail', import.meta.url),
);

let app;

async function boot(imports) {
  const moduleRef = await Test.createTestingModule({ imports }).compile();
  app = moduleRef;
  await moduleRef.init();
  return moduleRef;
}

function collectEvents(moduleRef) {
  const events = [];
  moduleRef.get(MailEvents).events$.subscribe((event) => events.push(event));
  return events;
}

/** A nodemailer transport object that fails every send with `error` */
function failingTransport(error) {
  const transport = {
    name: 'Failing',
    version: '1.0.0',
    calls: 0,
    send(_mail, callback) {
      transport.calls++;
      callback(Object.assign(new Error(error.message), error));
    },
  };
  return transport;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('NodemailerMailTransport with @nestjs/mail', () => {
  it('sends the MIME message @nestjs/mail built', async () => {
    const transport = new NodemailerMailTransport({
      streamTransport: true,
      buffer: true,
    });
    const sent = [];
    const sendMail = transport.transporter.sendMail.bind(transport.transporter);
    transport.transporter.sendMail = async (mail) => {
      const info = await sendMail(mail);
      sent.push(info);
      return info;
    };
    const moduleRef = await boot([
      MailModule.forRoot({ transport, from: 'App <app@example.com>' }),
    ]);

    const result = await moduleRef.get(Mailer).send({
      to: 'ada@example.com',
      bcc: 'audit@example.com',
      subject: 'Interop subject',
      html: '<p>Interop body</p>',
    });

    assert.equal(result.attempts, 1);
    assert.deepEqual(result.accepted, ['ada@example.com', 'audit@example.com']);
    assert.equal(sent.length, 1);
    const raw = sent[0].message.toString();
    assert.match(raw, /^Subject: Interop subject\r?$/m);
    assert.match(raw, /Interop body/);
    assert.ok(raw.includes(`Message-ID: ${result.messageId}`));
    assert.equal(result.providerMessageId, result.messageId);
    // Bcc stays on the envelope only
    assert.doesNotMatch(raw, /audit@example\.com/);
    assert.deepEqual(sent[0].envelope.to, [
      'ada@example.com',
      'audit@example.com',
    ]);
  });

  it('does not retry a permanent nodemailer error (SMTP 550)', async () => {
    const failing = failingTransport({
      message: '550 Mailbox unavailable',
      responseCode: 550,
    });
    const moduleRef = await boot([
      MailModule.forRoot({
        transport: new NodemailerMailTransport(failing),
        from: 'app@example.com',
        retry: { attempts: 2, backoff: { delay: 1, jitter: 'none' } },
      }),
    ]);
    const events = collectEvents(moduleRef);

    const error = await moduleRef
      .get(Mailer)
      .send({ to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>' })
      .then(
        () => assert.fail('should have failed'),
        (err) => err,
      );

    assert.equal(error.permanent, true);
    assert.equal(error.responseCode, 550);
    assert.equal(failing.calls, 1);
    const failed = events.find((event) => event.type === 'failed');
    assert.equal(failed.permanent, true);
    assert.equal(failed.attempts, 1);
    assert.equal(failed.transport, 'NodemailerMailTransport');
  });

  it('retries a transient nodemailer error (ECONNECTION)', async () => {
    const failing = failingTransport({
      message: 'Connection refused',
      code: 'ECONNECTION',
    });
    const moduleRef = await boot([
      MailModule.forRoot({
        transport: new NodemailerMailTransport(failing),
        from: 'app@example.com',
        retry: { attempts: 2, backoff: { delay: 1, jitter: 'none' } },
      }),
    ]);
    const events = collectEvents(moduleRef);

    const error = await moduleRef
      .get(Mailer)
      .send({ to: 'ada@example.com', subject: 'Hi', html: '<p>Hi</p>' })
      .then(
        () => assert.fail('should have failed'),
        (err) => err,
      );

    assert.equal(error.permanent, false);
    assert.equal(error.code, 'ECONNECTION');
    assert.equal(failing.calls, 2);
    const failed = events.find((event) => event.type === 'failed');
    assert.equal(failed.permanent, false);
    assert.equal(failed.attempts, 2);
  });
});

describe('TemplateAdapterEngine with @nestjs/mail', () => {
  async function bootWithTemplates() {
    const transport = new NodemailerMailTransport({
      streamTransport: true,
      buffer: true,
    });
    const moduleRef = await boot([
      MailModule.forRoot({
        transport,
        from: 'app@example.com',
        templates: new TemplateAdapterEngine({
          adapter: new HandlebarsAdapter(),
          dir: templatesDir,
        }),
      }),
    ]);
    return moduleRef.get(Mailer);
  }

  it('renders a Handlebars template', async () => {
    const mailer = await bootWithTemplates();
    const message = await mailer.render({
      subject: 'Welcome',
      template: 'welcome',
      context: { name: 'Ada' },
    });
    assert.match(message.html, /<p>Hello Ada<\/p>/);
    assert.match(message.text, /Hello Ada/);
    assert.equal(message.template, 'welcome');
  });

  it('renders the localized template (suffix and folder layouts)', async () => {
    const mailer = await bootWithTemplates();
    const es = await mailer.render({
      subject: 'Bienvenida',
      template: 'welcome',
      context: { name: 'Ada' },
      locale: 'es-CO',
    });
    assert.match(es.html, /<p>Hola Ada<\/p>/);
    assert.equal(es.locale, 'es-CO');

    const fr = await mailer.render({
      subject: 'Bienvenue',
      template: 'welcome',
      context: { name: 'Ada' },
      locale: 'fr',
    });
    assert.match(fr.html, /<p>Bonjour Ada<\/p>/);
  });

  it('sends a templated mail end to end', async () => {
    const mailer = await bootWithTemplates();
    const result = await mailer.send({
      to: 'ada@example.com',
      subject: 'Welcome',
      template: 'welcome',
      context: { name: 'Ada' },
      locale: 'es',
    });
    assert.equal(result.attempts, 1);
    assert.deepEqual(result.accepted, ['ada@example.com']);
  });

  it('a missing template is permanent and not retried', async () => {
    const mailer = await bootWithTemplates();
    const error = await mailer
      .send({ to: 'ada@example.com', subject: 'x', template: 'missing' })
      .then(
        () => assert.fail('should have failed'),
        (err) => err,
      );
    assert.equal(error.permanent, true);
  });
});

describe('MailerServiceTransport with @nestjs/mail', () => {
  it('delivers @nestjs/mail messages through MailerService', async () => {
    const moduleRef = await boot([
      MailerTestModule.register(),
      MailModule.forRoot({
        transport: MailerServiceTransport,
        from: 'App <app@example.com>',
      }),
    ]);
    const mailbox = moduleRef.get(TestMailbox);
    const ourEvents = [];
    moduleRef
      .get(MailerEventService)
      .events$.subscribe((record) => ourEvents.push(record));

    const result = await moduleRef.get(Mailer).send({
      to: 'ada@example.com',
      subject: 'Through MailerService',
      html: '<p>Delivered by @nestjs-modules/mailer</p>',
      idempotencyKey: 'order-42',
    });

    assert.equal(result.attempts, 1);
    assert.deepEqual(result.accepted, ['ada@example.com']);
    assert.equal(mailbox.mails.length, 1);
    const captured = mailbox.mails[0];
    assert.deepEqual(captured.envelope.to, ['ada@example.com']);
    assert.match(captured.raw, /Subject: Through MailerService/);
    assert.match(captured.raw, /Delivered by @nestjs-modules\/mailer/);
    assert.ok(captured.raw.includes(`Message-ID: ${result.messageId}`));
    mailbox.assertCount(1, { to: 'ada@example.com' });
    // Raw messages are matched on the fields their MIME carries
    assert.equal(captured.subject, 'Through MailerService');
    assert.deepEqual(captured.to, ['ada@example.com']);
    mailbox.assertSent({ subject: 'Through MailerService' });
    // Our own events saw the send, with retries left to @nestjs/mail
    const afterSend = ourEvents.find((r) => r.event === 'mailer.after_send');
    assert.equal(afterSend.attempt, 1);
    assert.equal(afterSend.mailOptions.retry, false);
    assert.equal(afterSend.mailOptions.messageId, result.messageId);
  });

  it('applies MailerModule interception to the envelope', async () => {
    const moduleRef = await boot([
      MailerTestModule.register({
        intercept: { to: 'qa@example.com', allow: ['@internal.example.com'] },
      }),
      MailModule.forRoot({
        transport: MailerServiceTransport,
        from: 'app@example.com',
      }),
    ]);
    const mailbox = moduleRef.get(TestMailbox);

    const result = await moduleRef.get(Mailer).send({
      to: ['customer@example.com', 'dev@internal.example.com'],
      subject: 'Intercepted',
      html: '<p>Hi</p>',
    });

    assert.deepEqual(mailbox.last.envelope.to, [
      'dev@internal.example.com',
      'qa@example.com',
    ]);
    assert.deepEqual(mailbox.last.to, ['qa@example.com']);
    assert.equal(
      mailbox.last.headers['X-Intercepted-Recipients'],
      'customer@example.com',
    );
    // The stream transport reports no `accepted`: the delivered envelope stands in
    assert.deepEqual(result.accepted, [
      'dev@internal.example.com',
      'qa@example.com',
    ]);
  });

  it('uses a named transporter with MailerServiceTransport.for()', async () => {
    const moduleRef = await boot([
      MailerModule.forRoot({
        transport: { jsonTransport: true },
        transports: { stream: { streamTransport: true, buffer: true } },
      }),
      MailModule.forRoot({
        transport: MailerServiceTransport.for('stream'),
        from: 'app@example.com',
      }),
    ]);
    const events = collectEvents(moduleRef);

    const result = await moduleRef.get(Mailer).send({
      to: 'ada@example.com',
      subject: 'Named',
      html: '<p>Named</p>',
    });

    assert.equal(result.attempts, 1);
    assert.deepEqual(result.accepted, ['ada@example.com']);
    const sent = events.find((event) => event.type === 'sent');
    assert.equal(sent.transport, 'MailerServiceTransport(stream)');
  });

  it('a permanent failure in MailerService is not retried by @nestjs/mail', async () => {
    const moduleRef = await boot([
      MailerTestModule.register(),
      MailModule.forRoot({
        transport: MailerServiceTransport,
        from: 'app@example.com',
        retry: { attempts: 3, backoff: { delay: 1, jitter: 'none' } },
      }),
    ]);
    const mailbox = moduleRef.get(TestMailbox);
    mailbox.failNext(Object.assign(new Error('550 no'), { responseCode: 550 }));
    const events = collectEvents(moduleRef);

    const error = await moduleRef
      .get(Mailer)
      .send({ to: 'ada@example.com', subject: 'x', html: '<p>x</p>' })
      .then(
        () => assert.fail('should have failed'),
        (err) => err,
      );
    assert.equal(error.permanent, true);
    assert.equal(events.find((e) => e.type === 'failed').attempts, 1);
    assert.equal(mailbox.mails.length, 0);
  });
});

describe('@nestjs/mail mail classes with MailerService', () => {
  class OrderShippedMail {
    render(order, { locale, to }) {
      return {
        subject: `Order #${order.id} shipped`,
        // `to` is `{ name?, address }[]` in both libraries
        html: `<p>Hi ${to[0].address}, order ${order.id} (${locale ?? 'default'})</p>`,
      };
    }
  }
  // Decorators aren't plain JavaScript yet: apply `@Injectable()` by hand
  Injectable()(OrderShippedMail);

  it('sends an official-style Mailable with our MailerService', async () => {
    const moduleRef = await boot([MailerTestModule.register()]);
    const mailbox = moduleRef.get(TestMailbox);

    await moduleRef.get(MailerService).send(OrderShippedMail, {
      to: 'ada@example.com',
      from: 'shop@example.com',
      data: { id: 42 },
      locale: 'es',
    });

    const mail = mailbox.assertSent({
      to: 'ada@example.com',
      subject: 'Order #42 shipped',
      mail: OrderShippedMail,
    });
    assert.equal(mail.html, '<p>Hi ada@example.com, order 42 (es)</p>');
  });

  it('the same class works with the official Mailer', async () => {
    const moduleRef = await boot([
      MailerTestModule.register(),
      MailModule.forRoot({
        transport: MailerServiceTransport,
        from: 'shop@example.com',
      }),
    ]);
    const result = await moduleRef.get(Mailer).send(OrderShippedMail, {
      to: 'ada@example.com',
      data: { id: 7 },
    });
    assert.equal(result.attempts, 1);
    assert.match(
      moduleRef.get(TestMailbox).last.raw,
      /Subject: Order #7 shipped/,
    );
  });
});
