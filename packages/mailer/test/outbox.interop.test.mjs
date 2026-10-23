// Integration tests against the real, ESM-only `@nestjs/outbox` package, run by
// Node's test runner on the compiled output in `dist/`. The outbox runs on its
// in-memory store, whose `transaction()` stands in for a database transaction.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, describe, it } from 'node:test';
import { Injectable } from '@nestjs/common';
import {
  Outbox,
  OutboxDeadLetters,
  OutboxModule,
  OutboxRelay,
  OutboxStorage,
} from '@nestjs/outbox';
import { Test } from '@nestjs/testing';

const require = createRequire(import.meta.url);
const { MailerTestModule, TestMailbox } = require(
  '../dist/index.js',
);
const { MailerOutbox, MailerOutboxModule } = require(
  '../dist/outbox/index.js',
);
const { messageIdFor } = require('../dist/utils/recipients.js');

class WelcomeMail {
  render(user, { locale }) {
    return {
      subject: `Welcome ${user.name}`,
      html: `<p>Hi ${user.name} (${locale ?? 'default'})</p>`,
    };
  }
}
// Decorators aren't plain JavaScript yet: apply `@Injectable()` by hand
Injectable()(WelcomeMail);

let app;

async function boot({ relay = { enabled: false }, retry } = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      MailerTestModule.register(),
      OutboxModule.forRoot({ relay, retry }),
      MailerOutboxModule.register({ mailables: [WelcomeMail] }),
    ],
  }).compile();
  app = moduleRef;
  await moduleRef.init();
  const store = moduleRef.get(OutboxStorage).messages;
  return {
    moduleRef,
    mailbox: moduleRef.get(TestMailbox),
    mailerOutbox: moduleRef.get(MailerOutbox),
    relay: moduleRef.get(OutboxRelay),
    deadLetters: moduleRef.get(OutboxDeadLetters),
    /** Runs `work` in an in-memory store transaction: committed when it resolves */
    transaction: (work) => store.transaction(work),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('MailerOutbox with @nestjs/outbox', () => {
  it('sends a recorded email after the transaction commits', async () => {
    const { mailbox, mailerOutbox, relay, transaction } = await boot();

    const message = await transaction((tx) =>
      mailerOutbox.add(tx, {
        to: 'ada@example.com',
        from: 'app@example.com',
        subject: 'Order placed',
        html: '<p>Thanks</p>',
        attachments: [{ filename: 'a.txt', content: Buffer.from('hello') }],
      }),
    );
    assert.equal(message.topic, 'mailer.send');
    assert.equal(message.payload.mail.attachments[0].encoding, 'base64');
    assert.equal(mailbox.mails.length, 0);

    const run = await relay.runOnce();
    assert.equal(run.published, 1);
    const mail = mailbox.assertSent({
      to: 'ada@example.com',
      subject: 'Order placed',
    });
    // The outbox message id is the idempotency key: a stable Message-ID
    assert.equal(
      mail.messageId,
      messageIdFor(message.id, 'app@example.com'),
    );
    // The Buffer was stored as base64, which nodemailer decodes when it sends
    assert.deepEqual(mail.attachments[0], {
      filename: 'a.txt',
      content: 'aGVsbG8=',
      encoding: 'base64',
    });
    assert.match(mail.raw, /filename=a\.txt[\s\S]*\r?\naGVsbG8=\r?\n/);
  });

  it('sends nothing when the transaction rolls back', async () => {
    const { mailbox, mailerOutbox, relay, transaction } = await boot();

    await assert.rejects(
      transaction(async (tx) => {
        mailerOutbox.add(tx, { to: 'ada@example.com', subject: 'Never' });
        throw new Error('rollback');
      }),
      /rollback/,
    );

    const run = await relay.runOnce();
    assert.equal(run.claimed, 0);
    assert.equal(mailbox.mails.length, 0);
  });

  it('notify() wakes the running relay', async () => {
    const { mailbox, mailerOutbox, transaction } = await boot({
      relay: { pollInterval: '1h' },
    });

    await transaction((tx) =>
      mailerOutbox.add(tx, { to: 'ada@example.com', subject: 'Now' }),
    );
    mailerOutbox.notify();
    for (let i = 0; i < 100 && mailbox.mails.length === 0; i++) await sleep(5);

    mailbox.assertSent({ subject: 'Now' });
  });

  it('dead-letters a permanent failure (SMTP 550) without retrying', async () => {
    const { mailbox, mailerOutbox, relay, deadLetters, transaction } =
      await boot({ retry: { attempts: 5, backoff: { delay: 1 } } });
    const error = Object.assign(new Error('550 Mailbox unavailable'), {
      responseCode: 550,
    });
    mailbox.failNext(error);

    const message = await transaction((tx) =>
      mailerOutbox.add(tx, { to: 'nobody@example.com', subject: 'Bounce' }),
    );
    const run = await relay.runOnce();

    assert.equal(run.deadLettered, 1);
    assert.equal(run.retried, 0);
    const [dead] = await deadLetters.list();
    assert.equal(dead.id, message.id);
    assert.equal(dead.reason, 'rejected');
    assert.equal(dead.attempts, 1);
    assert.match(dead.lastError, /550 Mailbox unavailable/);
    assert.equal(mailbox.mails.length, 0);
  });

  it('retries a transient failure (ECONNECTION) and then delivers', async () => {
    const { mailbox, mailerOutbox, relay, deadLetters, transaction } =
      await boot({
        retry: { attempts: 3, backoff: { delay: 1, jitter: 'none' } },
      });
    mailbox.failNext(
      Object.assign(new Error('Connection refused'), { code: 'ECONNECTION' }),
    );

    const message = await transaction((tx) =>
      mailerOutbox.add(tx, {
        to: 'ada@example.com',
        from: 'app@example.com',
        subject: 'Retried',
      }),
    );
    const first = await relay.runOnce();
    assert.equal(first.retried, 1);
    assert.equal(mailbox.mails.length, 0);

    await sleep(10);
    const second = await relay.runOnce();
    assert.equal(second.published, 1);
    const mail = mailbox.assertSent({ subject: 'Retried' });
    // The redelivery keeps the Message-ID of the first attempt
    assert.equal(
      mail.messageId,
      messageIdFor(message.id, 'app@example.com'),
    );
    assert.deepEqual(await deadLetters.list(), []);
  });

  it('sends a mail class recorded by name', async () => {
    const { mailbox, mailerOutbox, relay, transaction } = await boot();

    const message = await transaction((tx) =>
      mailerOutbox.add(
        tx,
        {
          mail: WelcomeMail,
          to: 'ada@example.com',
          data: { name: 'Ada' },
          locale: 'es',
        },
        { key: 'user-1' },
      ),
    );
    assert.equal(message.payload.mailable, 'WelcomeMail');
    assert.equal(message.key, 'user-1');

    await relay.runOnce();
    const mail = mailbox.assertSent({
      to: 'ada@example.com',
      subject: 'Welcome Ada',
      mail: WelcomeMail,
    });
    assert.equal(mail.html, '<p>Hi Ada (es)</p>');
  });

  it('dead-letters a mail class that is no longer registered', async () => {
    const { mailbox, relay, deadLetters, transaction, moduleRef } =
      await boot();
    const outbox = moduleRef.get(Outbox);

    await transaction((tx) =>
      outbox.add(tx, {
        topic: 'mailer.send',
        payload: { v: 1, mailable: 'RemovedMail', options: {} },
      }),
    );
    const run = await relay.runOnce();

    assert.equal(run.deadLettered, 1);
    const [dead] = await deadLetters.list();
    assert.match(dead.lastError, /RemovedMail/);
    assert.equal(mailbox.mails.length, 0);
  });

  it('refuses what JSON cannot store', async () => {
    const { mailerOutbox, transaction } = await boot();
    const { Readable } = await import('node:stream');

    await assert.rejects(
      transaction((tx) =>
        mailerOutbox.add(tx, {
          to: 'ada@example.com',
          attachments: [{ filename: 'a', content: Readable.from(['x']) }],
        }),
      ),
      /mail\.attachments\[0\]\.content is a stream/,
    );
  });
});
