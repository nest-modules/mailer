---
title: Reliability
---

# Reliability

Mail servers and providers fail in ordinary ways: a connection drops, a provider rate-limits you, a server greylists the first attempt. v4 handles these without extra code: transient failures are **retried** with exponential backoff, a failing transporter can **fail over** to another one, a send can be **aborted** with an `AbortSignal`, and an **idempotency key** gives a redelivered email the same `Message-ID` so mailbox providers can drop the duplicate. Retries never risk a second copy: a failure that may already have been delivered is retried only when it is safe.

## Retries

Retries are on by default: **3 attempts** in total, waiting 1s, then 2s (doubling up to 30s), with full jitter. Only [transient errors](#what-is-retried) are retried; a rejected recipient or a template error fails at once.

::: warning Duplicate protection
A timeout, or a connection dropped while the message was being handed over, does not mean the email wasn't delivered. Such failures are retried (or failed over) **only when the email has an `idempotencyKey` or a `messageId`**. Without one they are thrown at once, so a customer never gets the same email twice. Set an [`idempotencyKey`](#idempotency-keys) on emails you want retried in that case.
:::

Configure them for the whole module:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user:pass@smtp.example.com',
      retry: {
        attempts: 5,
        backoff: { delay: 500, factor: 2, maxDelay: 10_000, jitter: 'equal' },
      },
    }),
  ],
})
export class AppModule {}
```

Or per send, which overrides the module setting:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Your code',
  text: 'Your code is 123456',
  retry: false, // send once
});
```

`retry` accepts:

| Value | Meaning |
| --- | --- |
| `number` | Total attempts, including the first (`retry: 3`) |
| `false` | A single attempt (the v3 behavior) |
| `{ attempts, backoff, retryIf }` | Full options, see below |

| Option | Default | Description |
| --- | --- | --- |
| `attempts` | `3` | Total attempts, including the first. Must be a whole number ≥ 1 |
| `backoff.delay` | `1000` | Wait before the first retry, in ms |
| `backoff.factor` | `2` | Growth per retry (`1` = constant). Must be ≥ 1 |
| `backoff.maxDelay` | `30000` | Cap for a single wait, in ms |
| `backoff.jitter` | `'full'` | `'full'` (random between 0 and the delay), `'equal'` (half fixed, half random) or `'none'` |
| `backoff` (function) | | `(attempt, error) => ms`, called with the 1-based attempt that just failed |
| `retryIf` | | `(error, attempt) => boolean`: narrows which transient errors are retried. Permanent errors are never retried, whatever it returns |

Invalid values (`attempts: 0`, `factor: 0.5`, a negative or non-numeric `delay` or `maxDelay`) throw when the module starts. Backoff keys given as `undefined` (for example `delay: config.get('MAIL_RETRY_DELAY')` when the variable isn't set) keep their defaults.

When an error carries a `retryAfterMs` number (a provider's `Retry-After`), the wait is at least that long, capped at `maxDelay`.

Every retry emits a [`mailer.retry` event](./events.md) with the error and the attempt number.

### What is retried

The classification is exported as `isTransientError(error)`, so you can reuse it:

```typescript
import { isTransientError } from '@nestjs-modules/mailer';
```

The rules, in order:

1. An explicit boolean `permanent` property on the error wins (`permanent: true` is never retried). Every [typed error](./errors.md) carries one.
2. AWS SDK v3 errors (for example from nodemailer's SES transport): `$retryable` means transient; `$fault: 'client'` is permanent, `$fault: 'server'` transient.
3. An SMTP `responseCode` of 5xx is permanent; 4xx (greylisting, rate limits) is transient.
4. An HTTP `status`, `statusCode` or `$metadata.httpStatusCode` of 408, 409, 429 or 5xx is transient; any other 4xx is permanent.
5. Network codes are transient: `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `EDNS`, `EPROTOCOL`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `EAI_AGAIN`, `ENOTFOUND`, `EHOSTUNREACH`, `ENETUNREACH`, `ECONNABORTED`, `ESOCKETTIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_SOCKET`. Any other string `code` (for example `EAUTH`, `EENVELOPE`) is permanent.
6. Programming errors (`TypeError`, `ReferenceError`, `SyntaxError`, `RangeError`) are permanent.
7. Anything else is treated as transient.

## Duplicate protection

Some failures happen after the server may already have accepted the message. Retrying them could deliver the email twice. `mayHaveBeenDelivered(error)` (exported) recognizes them:

- the mailer's own per-attempt timeout (`sendTimeout` / `timeout`): the send keeps running in the background and may still succeed;
- a dropped connection or socket timeout (`ETIMEDOUT`, `ESOCKETTIMEDOUT`, `ECONNRESET`, `ESOCKET`, `EPIPE`, `ECONNABORTED`, `UND_ERR_SOCKET`) with no SMTP command recorded, or after `RCPT TO` (that is, while the message itself was being sent). This includes an [HTTP transport](./http-transports.md) request that timed out.

Such an error is retried, or failed over to the next transporter, **only when the email has a stable `Message-ID`**: an `idempotencyKey` or an explicit `messageId`. A second copy then carries the same `Message-ID`, and mailbox providers can drop it. Without one, the error is thrown to you at once.

```typescript
import { mayHaveBeenDelivered } from '@nestjs-modules/mailer';

try {
  await this.mailerService.sendMail({ to, subject, html, idempotencyKey: `receipt:${order.id}` });
} catch (error) {
  if (mayHaveBeenDelivered(error)) {
    // Don't tell the user it failed: it may have arrived
  }
  throw error;
}
```

A connection failure before any message data was sent (`ECONNREFUSED`, a timeout while connecting or during `MAIL FROM`) can't cause a duplicate and is retried as usual. [Queued](./queue.md) and [outbox](./outbox.md) emails always carry an idempotency key, so this protection never stops their retries.

## Timeouts

`sendTimeout` (module) and `timeout` (per send) limit how long **each attempt** may take, in milliseconds; with retries, the whole send can take longer. A timed-out attempt rejects with a [`MailerTimeoutError`](./errors.md) (`code: 'ETIMEDOUT'`, `timeoutMs`). The send it gave up on may still complete, so it is retried only when the email has a stable `Message-ID` ([duplicate protection](#duplicate-protection)). For an overall deadline, use a [`signal`](#aborting-a-send).

```typescript
MailerModule.forRoot({
  transport: { host: 'smtp.example.com', port: 587 },
  sendTimeout: 10_000,
});

await this.mailerService.sendMail({ to, subject, html, timeout: 3_000 });
```

## Failover

With several [named transporters](./configuration.md#multiple-transporters), `failover` lists the ones to try, in order, when the selected transporter fails:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transports: {
        ses: { host: 'email-smtp.eu-west-1.amazonaws.com', port: 587, auth: { user: 'key', pass: 'secret' } },
        backup: { host: 'smtp.backup-provider.com', port: 587, auth: { user: 'user', pass: 'pass' } },
      },
      failover: ['backup'],
    }),
  ],
})
export class AppModule {}
```

```typescript
await this.mailerService.sendMail({
  transporterName: 'ses',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello</p>',
});
```

The next transporter is tried when one fails with a transient error (after its own retries, and subject to [duplicate protection](#duplicate-protection)), or with an error of the transport itself that another transport could avoid: bad credentials or TLS problems (`EAUTH`, `ETLS`, `ENOAUTH`, `EOAUTH2`). It is **not** tried when the message itself is rejected (an SMTP 5xx for a bad recipient, a template error): another provider would reject it too.

- Each transporter in the chain gets the full retry policy, so `retry: 3` with one failover transporter can mean up to 6 attempts.
- If the selected transporter also appears in `failover`, it is skipped.
- Per send, `failover: ['other']` replaces the module list and `failover: false` disables it.
- A name that is not in `transports` throws a `ReferenceError` when it is reached.
- When every transporter fails, the last error is thrown.
- Each switch logs a warning and emits a [`mailer.failover` event](./events.md) whose `transporterName` is the transporter tried next.

## Aborting a send

Pass an `AbortSignal` to give up on a send, including the wait between retries:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Report',
  html: '<p>…</p>',
  signal: controller.signal,
});
```

The promise rejects with `signal.reason` (or an `AbortError`). An aborted send is neither retried nor failed over.

::: warning
Aborting stops *waiting*; it cannot recall a message. A message the server already received may still be delivered.
:::

`AbortSignal.timeout(ms)` works too, as an overall deadline across all attempts (unlike `timeout`, which applies per attempt).

## Idempotency keys

When an email can be sent more than once for the same event (a job redelivered, a retried webhook, an outbox relay), pass an `idempotencyKey`:

```typescript
await this.mailerService.sendMail({
  to: order.email,
  subject: `Order #${order.id} confirmed`,
  template: 'order-confirmed',
  context: { order },
  idempotencyKey: `order-confirmed:${order.id}`,
});
```

The `Message-ID` is derived from the key: `<` + the first 32 hex characters of its SHA-256 + `@` + the sender's domain + `>` (the domain of `from`, or of `defaults.from`, else `nestjs-mailer.local`). The same key always yields the same `Message-ID`, which Gmail and other providers use to drop duplicates. An explicit `messageId` is kept as is.

::: tip
Use one key per email: two different emails with the same key get the same `Message-ID`, and one of them may be dropped.
:::

Queued emails get an idempotency key automatically, see [Queue](./queue.md#retries-and-permanent-failures).
