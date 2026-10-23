---
title: Delivery rules
---

# Delivery rules

Delivery rules decide *who* actually receives an email, independent of the code that sends it. **Interception** redirects real recipients to a safe inbox in staging and QA, so a copy of production data never mails a customer. **Suppression** drops addresses you must not write to (hard bounces, spam complaints, unsubscribed users). **One-click unsubscribe** adds the `List-Unsubscribe` headers that Gmail and Yahoo require from bulk senders. All three are new in v4.

The rules run on every send (`sendMail()`, `send()`, batches, queue jobs and outbox messages), in this order: [validation](./errors.md#validation), unsubscribe headers, idempotent `Message-ID`, suppression, interception.

## Interception (staging)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: config.get('SMTP_URL'),
        intercept: {
          enabled: config.get('APP_ENV') === 'staging',
          to: 'qa-inbox@example.com',
          allow: ['@example.com', 'partner@vendor.io', /^qa\+.*@gmail\.com$/],
          subjectPrefix: '[STAGING] ',
        },
      }),
    }),
  ],
})
export class AppModule {}
```

| Option | Description |
| --- | --- |
| `to` | Where intercepted email goes: an address or a list |
| `allow` | Recipients delivered normally: exact addresses (case-insensitive), domains written as `'@example.com'`, or regular expressions |
| `subjectPrefix` | Prepended to the subject of intercepted email, such as `'[STAGING] '` |
| `enabled` | Default `true`. Set it from configuration to turn interception off |

Every recipient in `to`, `cc` and `bcc` (and in a custom `envelope`'s `to`, `cc` and `bcc`, which is where raw messages are delivered) that does not match `allow` is removed, and the `intercept.to` addresses are added to `to`. The original recipients are recorded in an `X-Intercepted-Recipients` header, so QA can see who the email was meant for. When every recipient is allowed, the email is sent untouched (no prefix, no header).

## Suppression lists

`suppress` is called for every recipient (`to`, `cc`, `bcc`, and those of a custom `envelope`); return `true` to drop it. It may be `async`, so it can query a database:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { SuppressionModule } from './suppression/suppression.module';
import { SuppressionService } from './suppression/suppression.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [SuppressionModule],
      inject: [SuppressionService],
      useFactory: (suppressions: SuppressionService) => ({
        transport: process.env.SMTP_URL,
        // Bounces and complaints apply to everything; unsubscribes only to newsletters
        suppress: async (address, mail) =>
          (await suppressions.hasBouncedOrComplained(address)) ||
          (mail.template === 'newsletter' &&
            (await suppressions.hasUnsubscribed(address))),
      }),
    }),
  ],
})
export class AppModule {}
```

The second argument is the email being sent (`ISendMailOptions`), so you can apply different lists to different kinds of email, as above.

- The remaining recipients still get the email, and a [`mailer.suppressed` event](./events.md) lists the dropped addresses.
- If **no recipient is left**, nothing is sent and the call resolves (it does not throw) to a `SuppressedMessageInfo`:

```typescript
{
  messageId: undefined,
  accepted: [],
  rejected: [],
  suppressed: ['bounced@example.com'],
  response: 'Not sent: every recipient is suppressed',
}
```

Suppression runs before interception, so a suppressed address is never redirected to the QA inbox either.

## One-click unsubscribe

Gmail and Yahoo require bulk senders to support one-click unsubscribe ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058)). Pass `unsubscribe` per send (or return it from a [mail class](./mailables.md)):

```typescript
await this.mailerService.sendMail({
  to: user.email,
  subject: 'This week at Example',
  template: 'newsletter',
  context: { user },
  unsubscribe: {
    url: `https://example.com/unsubscribe?token=${user.unsubscribeToken}`,
    mailto: 'unsubscribe@example.com',
  },
});
```

This adds:

```
List-Unsubscribe: <https://example.com/unsubscribe?token=…>, <mailto:unsubscribe@example.com>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

| Option | Description |
| --- | --- |
| `url` | An HTTPS endpoint that unsubscribes the recipient when it receives a `POST` |
| `mailto` | An address (with or without `mailto:`) that unsubscribes the sender of a message sent to it |
| `oneClick` | Adds `List-Unsubscribe-Post`. Default: `true` when `url` is set |

At least one of `url` and `mailto` is required, and `oneClick: true` requires a `url`; otherwise the send throws a `TypeError`. Your endpoint must accept a `POST` with the body `List-Unsubscribe=One-Click` and must not require a login or confirmation page.
