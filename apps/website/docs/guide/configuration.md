---
title: Configuration
---

# Configuration

## Synchronous Configuration

Import `MailerModule.forRoot()` with your transport and template settings:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from: '"nest-modules" <modules@nestjs.com>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class AppModule {}
```

You can also pass a transport configuration object instead of a connection string:

```typescript
MailerModule.forRoot({
  transport: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'user@example.com',
      pass: 'password',
    },
  },
  // ...
})
```

## OAuth2 Authentication

Use Gmail or other providers with OAuth2:

```typescript
MailerModule.forRoot({
  transport: {
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: 'your-email@gmail.com',
      clientId: 'CLIENT_ID',
      clientSecret: 'CLIENT_SECRET',
      refreshToken: 'REFRESH_TOKEN',
    },
  },
  defaults: {
    from: '"App Name" <your-email@gmail.com>',
  },
})
```

See [Nodemailer OAuth2 docs](https://nodemailer.com/smtp/oauth2/) for details on setting up OAuth2 credentials.

## Async Configuration

Use `forRootAsync()` to load config from environment or external services:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: config.get('MAIL_PORT'),
          auth: {
            user: config.get('MAIL_USER'),
            pass: config.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('MAIL_FROM'),
        },
        template: {
          dir: __dirname + '/templates',
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## Multiple Transporters

Configure multiple SMTP servers with different credentials and switch between them per message:

```typescript
MailerModule.forRoot({
  transports: {
    primary: {
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'primary@example.com', pass: 'pass1' },
    },
    secondary: {
      host: 'smtp.other.com',
      port: 587,
      auth: { user: 'secondary@other.com', pass: 'pass2' },
    },
    ses: {
      SES: { /* AWS SES config */ },
    },
  },
  defaults: {
    from: '"No Reply" <noreply@example.com>',
  },
  template: {
    dir: __dirname + '/templates',
    adapter: new HandlebarsAdapter(),
  },
})
```

Then specify which transporter to use when sending:

```typescript
await this.mailerService.sendMail({
  transporterName: 'secondary',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<b>Hello</b>',
});
```

All transport types are supported for additional transporters: SMTP, SES, Sendmail, Stream, JSON, and custom transports.

## Dynamic Transporters

Add transporters at runtime using `addTransporter()`:

```typescript
this.mailerService.addTransporter('custom', {
  host: 'smtp.custom.com',
  port: 587,
  auth: { user: 'user', pass: 'pass' },
});

// Use immediately
await this.mailerService.sendMail({
  transporterName: 'custom',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello!</p>',
});
```

## Verify Transporters

Enable automatic transporter verification on startup:

```typescript
MailerModule.forRoot({
  transport: 'smtps://user@domain.com:pass@smtp.domain.com',
  verifyTransporters: true,
})
```

This checks SMTP connectivity when the module initializes. If verification fails, a warning is logged but the application continues to start.

Or verify programmatically:

```typescript
const allReady = await this.mailerService.verifyAllTransporters();
```

## Preview Emails

Use `preview-email` to open a preview in the browser during development:

```bash
pnpm add preview-email
```

```typescript
MailerModule.forRoot({
  transport: {
    host: 'localhost',
    port: 1025,
    ignoreTLS: true,
    secure: false,
  },
  defaults: {
    from: '"No Reply" <no-reply@localhost>',
  },
  preview: true,
  template: {
    dir: __dirname + '/templates',
    adapter: new HandlebarsAdapter(),
  },
})
```

::: info
- `preview-email` is an **optional** dependency. Install it only if you use this feature.
- Preview does **not** prevent the email from being sent — it runs alongside sending.
- Preview may not work in headless environments (Docker, CI servers).
- You can pass options: `preview: { open: { wait: false } }`.
:::

::: tip
To browse rendered emails on demand without sending them, use the [preview module](./preview.md). To write emails to disk or the log instead of sending, see [Dev transports](./dev-transports.md).
:::

## Copy Templates to `dist`

If your templates are inside `src/`, add them as assets in `nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "assets": ["**/*.hbs"]
  }
}
```

Use the appropriate extension (`.hbs`, `.pug`, `.ejs`) for your template engine.

::: warning
Templates are **not** compiled by TypeScript. If you reference templates with `__dirname`, make sure they exist in the `dist` folder at runtime.
:::

## Options Reference

Every option `MailerModule.forRoot()` (or the `forRootAsync()` factory) accepts:

| Option | Description |
| --- | --- |
| `transport` | The default transport: a connection URL, nodemailer transport options, or a transport instance |
| `transports` | Named transports, selected per message with `transporterName` |
| `defaults` | Default message fields (`from`, `replyTo`, …) merged into every email |
| `template` | `dir`, `dirs`, `adapter`, `options` (compile options) and `resolver` (see [Adapters](./adapters.md) and [Template resolver](./template-resolver.md)) |
| `options` | Runtime options for the adapter (Handlebars `partials`, `layout`, …) |
| `i18n` | Locale-aware templates: `defaultLocale`, `templateDirPattern`, `fallback` (see [i18n](./i18n.md)) |
| `preview` | Open sent emails in the browser with `preview-email` (see [above](#preview-emails)) |
| `verifyTransporters` | Verify every transporter on startup |
| `plugins` | Nodemailer plugins (`{ step: 'compile' \| 'stream', plugin }`) registered on all transporters |
| `sendTimeout` | Timeout of **each attempt** in ms; a timeout rejects with a `MailerTimeoutError` and is retried only with a stable `Message-ID` (see [Reliability](./reliability.md#timeouts)) |
| `rateLimit` | `{ maxMessages, period? }` for [batch sending](./batch-sending.md) |
| `retry` | **v4.** Retries for transient failures: a number of attempts, `false`, or `{ attempts, backoff, retryIf }`. Default: 3 attempts (see [Reliability](./reliability.md#retries)) |
| `failover` | **v4.** Named transporters to try, in order, when the selected one fails (see [Reliability](./reliability.md#failover)) |
| `intercept` | **v4.** Redirect recipients to a safe inbox in staging: `{ to, allow?, subjectPrefix?, enabled? }` (see [Delivery rules](./delivery-rules.md#interception-staging)) |
| `textFromHtml` | **v4.** Derive a plain-text part from the final HTML when an email has none. Default `true` (see [Sending emails](./sending-emails.md#plain-text-part)) |
| `wrapErrors` | **v4.** Throw [typed errors](./errors.md) (`MailerSmtpError`, `MailerTimeoutError`, …) that keep the original as `cause`. `false` rethrows what the transport threw. Default `true` |
| `validate` | **v4.** Reject malformed addresses, line breaks in addresses, the subject or headers, and invalid header names with a `MailerMessageError` before sending. Default `true` (see [Validation](./errors.md#validation)) |
| `shutdownTimeout` | **v4.** How long shutdown waits for sends in flight before closing the transporters, in ms. Default `30000` (see [Shutdown](#shutdown)) |
| `suppress` | **v4.** `(address, mail) => boolean \| Promise<boolean>`: drop recipients on a suppression list (see [Delivery rules](./delivery-rules.md#suppression-lists)) |

Per-message options such as `retry`, `failover`, `timeout`, `signal`, `idempotencyKey`, `unsubscribe` and `locale` are described in [Sending emails](./sending-emails.md), [Reliability](./reliability.md) and [Delivery rules](./delivery-rules.md).

## Shutdown

When the application shuts down (`app.close()`, or a signal with `app.enableShutdownHooks()`), `MailerService` first waits for the emails still being sent, up to `shutdownTimeout` (default 30 seconds), then closes the transporters, so a deploy doesn't cut a send in half. If sends are still running when the time is up, it logs a warning and closes anyway.

`drain(ms?)` is public, for when you need the same wait yourself:

```typescript
await this.mailerService.drain(5_000); // resolves when every send started so far has settled, or after 5s
```
