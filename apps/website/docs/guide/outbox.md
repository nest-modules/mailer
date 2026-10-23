---
title: Transactional outbox
---

# Transactional outbox

"Save the order, then send the confirmation" has two failure modes: the email goes out but the transaction rolls back, or the transaction commits but the process dies before the email is sent. The transactional outbox pattern fixes both: the email is written to an outbox table **in the same database transaction** as your data, and a relay sends it after the commit, retrying until it is delivered or dead-lettered. The `@nestjs-modules/mailer/outbox` entry point integrates the official [`@nestjs/outbox`](https://www.npmjs.com/package/@nestjs/outbox): you record emails with `MailerOutbox.add(tx, …)`, and a handler sends them with `MailerService`. It is optional, like the [BullMQ queue](./queue.md); see [choosing](#direct-queue-or-outbox) below.

## Installation

```bash
pnpm add @nestjs/outbox
```

`@nestjs/outbox` is an optional peer dependency, loaded only when `MailerOutboxModule.register()` runs. It is published as ES modules; CommonJS apps load it through `require(esm)`, which needs Node.js >= 20.19.

## Setup

Import `MailerModule`, `OutboxModule` and `MailerOutboxModule`. The outbox's store, relay and retries are configured on `OutboxModule`, as the `@nestjs/outbox` documentation describes (Postgres, MySQL, or the in-memory store for tests):

```typescript
import { Module } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailerOutboxModule } from '@nestjs-modules/mailer/outbox';
import { WelcomeMail } from './mail/welcome.mail';

@Module({
  imports: [
    MailerModule.forRoot({ transport: process.env.SMTP_URL }),
    OutboxModule.forRoot({ retry: { attempts: 10 } }),
    MailerOutboxModule.register({ mailables: [WelcomeMail], global: true }),
  ],
})
export class AppModule {}
```

| Option | Default | Description |
| --- | --- | --- |
| `topic` | `'mailer.send'` | The outbox topic emails are recorded under |
| `consumer` | `'mailer'` | The handler's inbox identity. Keep it stable: a new name makes every past message look unprocessed |
| `inbox` | `true` | Skip messages the handler already sent (inbox deduplication) |
| `mailables` | `[]` | The [mail classes](./mailables.md) that may be recorded. An array stores each class under its `name`; a record (`{ welcome: WelcomeMail }`) under its key, which survives renames and minification |
| `global` | `false` | Register `MailerOutbox` globally |

## Recording emails

Call `add()` with your open transaction, then `notify()` after the commit to skip the relay's poll interval:

```typescript
import { Injectable } from '@nestjs/common';
import { MailerOutbox } from '@nestjs-modules/mailer/outbox';
import { WelcomeMail } from './mail/welcome.mail';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Database,
    private readonly mailerOutbox: MailerOutbox,
  ) {}

  async register(dto: { email: string; name: string }) {
    await this.db.transaction(async (tx) => {
      const user = await tx.users.insert(dto);

      // A mail class, with the same options as mailerService.send(WelcomeMail, …)
      await this.mailerOutbox.add(tx, { mail: WelcomeMail, to: user.email, data: user });

      // Or send options written inline
      await this.mailerOutbox.add(tx, {
        to: 'sales@example.com',
        subject: `New sign-up: ${user.email}`,
        text: `${user.name} just signed up.`,
      });
    });
    this.mailerOutbox.notify();
  }
}
```

The third argument of `add()` is passed to `Outbox.add()`: `key` (per-key ordering), `id`, `headers`, `delay` or `availableAt`. `add()` returns a promise only with an asynchronous store; await it before the transaction commits.

## How the handler sends

- The outbox **message id is the `idempotencyKey`**, so every redelivery carries the same `Message-ID` and mailbox providers can drop a duplicate. An `idempotencyKey` you recorded yourself wins.
- `retry` is `false`: the outbox owns retries and their backoff, so attempts are never multiplied. [Failover](./reliability.md#failover) still applies within an attempt.
- The handler context's `signal` is passed on, so the send stops when the outbox aborts the handler.
- A **permanent** failure (SMTP 5xx, a bad template, an invalid message, a mail class missing from `mailables`) throws `NonRetryableMessageError`, and the message is dead-lettered at once. A transient one is rethrown for the outbox to retry.
- Mail classes are rendered when the message is delivered, not when it is recorded, with `MailerService.send()`.

## What can be stored

The email is stored as JSON, so `add()` checks it up front and throws a `TypeError` naming the path of anything JSON can't hold:

- **Buffers** (in attachments or anywhere else) are stored as base64 and restored; attachment contents are sent with `encoding: 'base64'`.
- **Dates** and other objects with `toJSON()` are stored through it (a `Date` becomes an ISO string).
- `undefined` properties are dropped.
- **Refused:** streams (pass a Buffer, a string, or a `path`/`href` read at send time), functions, symbols, bigints, `NaN`/`Infinity`, `Map`, `Set` and circular structures.
- **Refused:** `signal` and `retry`, which only make sense in the process that sends; the handler sets both.

For mail classes, `data` goes through the same rules, so `render()` receives plain JSON (a `Date` field arrives as a string).

## Testing

Use `MailerTestModule` and the outbox's in-memory store; `TestMailbox` sees what the handler sends:

```typescript
import { Test } from '@nestjs/testing';
import { OutboxModule, OutboxRelay } from '@nestjs/outbox';
import { MailerTestModule, TestMailbox } from '@nestjs-modules/mailer';
import { MailerOutboxModule } from '@nestjs-modules/mailer/outbox';

const moduleRef = await Test.createTestingModule({
  imports: [
    MailerTestModule.register(),
    OutboxModule.forRoot({ relay: { enabled: false } }),
    MailerOutboxModule.register({ mailables: [WelcomeMail] }),
  ],
}).compile();
await moduleRef.init();

// … record an email in a transaction, then:
await moduleRef.get(OutboxRelay).runOnce();
moduleRef.get(TestMailbox).assertSent({ mail: WelcomeMail });
```

## Direct, queue or outbox

All three are optional and can be combined in one app:

| | Direct (`send` / `sendMail`) | [BullMQ queue](./queue.md) | Transactional outbox |
| --- | --- | --- | --- |
| Needs | Nothing | Redis + `bullmq` | Your database + `@nestjs/outbox` |
| Sent | Now, in the request | In the background | After your transaction commits |
| Tied to your transaction | No | No: the job can be queued for a rolled-back change, or lost if enqueueing fails after the commit | Yes: recorded atomically with your data |
| Retries | The mailer's [`retry`](./reliability.md) | BullMQ attempts | The outbox's `retry` |
| Permanent failures | Thrown to the caller | `UnrecoverableError`, job failed at once | Dead-lettered at once |
| Duplicates on redelivery | `idempotencyKey` if you set one | A random key stored with each job | The outbox message id, plus inbox deduplication |
| Scheduling | No | `schedule()`, `delay`, priorities | `delay` / `availableAt` |
| Good for | Simple apps, emails that must fail the request | High volume, rate limits, scheduling | Emails that must match the state of your database |
