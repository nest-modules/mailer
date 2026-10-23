---
title: Errors and validation
---

# Errors and validation

When a send fails, you usually need to answer one question: retry later, or give up? In v4 every failure from a transport is thrown as a typed `MailerError` with a `permanent` flag and a class that says what went wrong: connection, timeout, SMTP reply, rejected recipients, template, message or HTTP provider. Malformed messages are caught by validation before anything is sent. Both are on by default, and both can be turned off.

## Typed errors

```typescript
import {
  MailerError,
  MailerRecipientsRejectedError,
  MailerSmtpError,
  MailerTimeoutError,
} from '@nestjs-modules/mailer';

try {
  await this.mailerService.sendMail({ to, subject, html });
} catch (error) {
  if (error instanceof MailerRecipientsRejectedError) {
    await this.users.markBounced(error.rejected);
  } else if (error instanceof MailerSmtpError && error.enhancedCode === '5.7.1') {
    this.logger.error(`Relay denied: ${error.response}`);
  } else if (error instanceof MailerError && !error.permanent) {
    // Transient: worth retrying later (the mailer already retried it)
  }
  throw error;
}
```

| Class | When | Fields | `permanent` |
| --- | --- | --- | --- |
| `MailerError` | Base class of all of them; also used for failures that fit no subclass | `permanent`, `code?`, `cause` | per [classification](./reliability.md#what-is-retried) |
| `MailerConnectionError` | DNS, socket or TLS failure before the server answered | `code` | `false`, except TLS certificate problems |
| `MailerTimeoutError` | The send took longer than allowed | `timeoutMs?`, `code: 'ETIMEDOUT'` | `false` |
| `MailerSmtpError` | The SMTP server answered with an error reply | `responseCode`, `enhancedCode?` (e.g. `5.1.1`), `command?`, `response?` | `true` for 5xx, `false` for 4xx |
| `MailerRecipientsRejectedError` | The server refused every recipient (extends `MailerSmtpError`) | `rejected: string[]` | like `MailerSmtpError` |
| `MailerTemplateError` | A template is missing or doesn't compile | `template?`, `code: 'ETEMPLATE'` | `true` |
| `MailerMessageError` | The message is invalid (see [validation](#validation)) | `field`, `code: 'EMESSAGE'` | `true` |
| `MailerProviderError` | An [HTTP email API](./http-transports.md) refused the request | `provider`, `status`, `providerCode?`, `retryAfterMs?` | `true` for 4xx other than 408, 409 and 429 |

What the transport threw is kept as `cause`, and nodemailer's fields (`responseCode`, `response`, `command`, `rejected`, `rejectedErrors`) are copied onto the typed error, so existing checks such as `error.responseCode === 550` keep working.

Not everything is wrapped:

- **Configuration errors** (an unknown `transporterName`, a `failover` name missing from `transports`) are thrown as they are, a `ReferenceError`.
- **Aborts** reject with the signal's own `reason`.
- **Validation errors** are already `MailerMessageError`.

`toMailerError(error)` applies the same conversion to any error, which is handy in code that calls nodemailer directly. A `MailerError` is returned unchanged.

To get exactly what the transport threw, as in v3:

```typescript
MailerModule.forRoot({
  transport: process.env.SMTP_URL,
  wrapErrors: false,
});
```

The `permanent` flag is the same one `@nestjs/mail`, `@nestjs/outbox` and the [BullMQ processor](./queue.md#retries-and-permanent-failures) read, so a permanent failure is never retried by any of them.

## Validation

Before an email is sent, `validateMessage()` rejects:

- malformed addresses in `from`, `sender`, `to`, `cc`, `bcc` and `replyTo` (anything that isn't `something@domain` without spaces);
- line breaks in addresses, display names, the `subject` or header values, which could inject headers;
- invalid header names (RFC 5322: printable ASCII without a colon).

The send then fails with a `MailerMessageError` whose `field` names the option (`'to'`, `'subject'`, `'headers'`…), before any transport is contacted and without retries. Raw messages (`raw`) are not checked, and header values marked `prepared: true` are written as given, by design.

```typescript
await this.mailerService.sendMail({ to: 'not-an-address', subject: 'Hi', text: 'Hi' });
// MailerMessageError: Invalid address in `to`: "not-an-address"  (field: 'to')
```

Turn it off with `validate: false`. `validateMessage` is exported if you want to check user input yourself first:

```typescript
import { BadRequestException } from '@nestjs/common';
import { MailerMessageError, validateMessage } from '@nestjs-modules/mailer';

try {
  validateMessage({ to: dto.email });
} catch (error) {
  if (error instanceof MailerMessageError) throw new BadRequestException(error.message);
  throw error;
}
```
