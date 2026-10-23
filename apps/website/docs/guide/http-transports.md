---
title: HTTP transports
---

# HTTP transports

Many email providers are easier to use through their HTTP API than over SMTP: no ports to open, no connection pools, and clear error codes. v4 ships zero-dependency transports for **Resend**, **Postmark**, **SendGrid**, **Amazon SES**, **Mailgun** and **Brevo**. They use Node.js' built-in `fetch` (and `node:crypto` to sign SES requests, without the AWS SDK), plug into `MailerModule` like any nodemailer transport, and throw [typed errors](./errors.md) that retries and failover understand. They are optional: nodemailer's SMTP and its community transports keep working, and so do [`@nestjs/mail`'s transports](./nestjs-mail.md).

## Usage

```typescript
import { Module } from '@nestjs/common';
import { MailerModule, ResendTransport } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
      defaults: { from: 'App <app@example.com>' },
    }),
  ],
})
export class AppModule {}
```

Templates, mail classes, delivery rules, events and the test mailbox work the same as with SMTP. Mix them with named transports and [failover](./reliability.md#failover):

```typescript
import { Module } from '@nestjs/common';
import { MailerModule, PostmarkTransport, SesTransport } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transports: {
        ses: new SesTransport({ region: 'eu-west-1' }),
        postmark: new PostmarkTransport({ serverToken: process.env.POSTMARK_TOKEN! }),
      },
      failover: ['postmark'],
    }),
  ],
})
export class AppModule {}
```

## Providers

| Transport | Required options | Other options | Idempotency |
| --- | --- | --- | --- |
| `ResendTransport` | `apiKey` | | `idempotencyKey` is sent as `Idempotency-Key` (Resend keeps it 24 hours) |
| `PostmarkTransport` | `serverToken` | `messageStream` (default `'outbound'`) | None |
| `SendGridTransport` | `apiKey` | `baseUrl: 'https://api.eu.sendgrid.com'` for EU subusers | None |
| `SesTransport` | `region` (or `AWS_REGION` / `AWS_DEFAULT_REGION`) | `credentials`, `configurationSetName`, `endpoint` | None |
| `MailgunTransport` | `apiKey`, `domain` | `region: 'us' \| 'eu'` (default `'us'`) | None |
| `BrevoTransport` | `apiKey` | | `idempotencyKey` is sent as `headers.IdempotencyKey` (Brevo doesn't document how it deduplicates) |

Every transport also takes:

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | the provider's API | Target a region, a proxy or a mock server. Must be `https` (or localhost). `SesTransport` calls it `endpoint` |
| `timeout` | `30000` | Per request, in ms |
| `fetch` | `globalThis.fetch` | Replace `fetch`, for example with a stub in tests |

Where a provider has no idempotency keys, a redelivered email can be sent twice. SES and Mailgun send the MIME message as built, so a [stable `Message-ID`](./reliability.md#idempotency-keys) still lets mailbox providers drop the duplicate.

### Amazon SES

`SesTransport` sends raw MIME through SES v2 (`POST /v2/email/outbound-emails`), signed with Signature Version 4. The message goes out exactly as nodemailer builds it (attachments, inline images, custom headers, DKIM signatures from plugins), and every envelope recipient is a destination, so `bcc` works.

```typescript
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { SesTransport } from '@nestjs-modules/mailer';

new SesTransport({
  region: 'eu-west-1',
  // Static credentials, or a function called on every send so it can refresh
  credentials: fromNodeProviderChain(),
  configurationSetName: 'transactional',
});
```

Without `credentials`, it reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`. Throttling errors are treated as transient.

### Mailgun

`MailgunTransport` uses Mailgun's MIME endpoint (`/v3/{domain}/messages.mime`), so, like SES, it sends the exact MIME message to every envelope recipient. Use `region: 'eu'` for domains in Mailgun's EU region.

### Raw messages

`SesTransport` and `MailgunTransport` send MIME, so they also accept raw messages (`raw`, as `@nestjs/mail` produces them through [`NodemailerMailTransport`](./nestjs-mail.md#_1-nodemailer-transports-for-nestjs-mail)) and raw MIME attachments. The JSON transports (Resend, Postmark, SendGrid, Brevo) take structured fields and refuse both with a `MailerMessageError`.

### Provider notes

- **Resend** needs at least one `to` recipient (`cc` or `bcc` alone is refused); inline `cid` images go as attachments with `content_id`.
- **Postmark** allows 50 recipients and 10 MB per message.
- **Brevo** has no content ids, so inline `cid` images go as regular attachments, and it takes a single reply-to address.

## Errors

A refusal is a [`MailerProviderError`](./errors.md#typed-errors) with `provider`, `status`, the provider's own `providerCode` and, from `Retry-After`, `retryAfterMs`, which the retry backoff honors. 4xx answers other than 408, 409 and 429 are permanent. No answer within `timeout` is a `MailerTimeoutError`; a network failure is a `MailerConnectionError`. Redirects are refused.

A request that timed out may still have reached the provider, so it is retried only when the email has a stable `Message-ID` (see [duplicate protection](./reliability.md#duplicate-protection)). With Resend, the `idempotencyKey` makes that retry safe on the provider side too.
