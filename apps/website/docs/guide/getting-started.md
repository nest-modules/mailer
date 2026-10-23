---
title: Getting Started
---

# Getting Started

`@nestjs-modules/mailer` is a mailer module for the [NestJS](https://nestjs.com/) framework powered by [Nodemailer](https://nodemailer.com/). It renders templates with the engine of your choice, sends through any nodemailer transport, and in v4 adds typed mail classes, automatic retries and failover, staging interception, a test mailbox and a browser preview.

::: tip Upgrading from v3?
Read the [migration guide](./migration.md): retries are now on by default.
:::

Using an older version? The [v3](/v3/) and [v2](/v2/) docs are still online, and [Versions & upgrading](./versions.md) shows what changed between them.

## Choose Your Setup

Every capability is optional. Pick one option on each line; you can mix them in one app and change your mind later without rewriting your emails:

| Choice | Options |
| --- | --- |
| **How you write emails** | [`sendMail()`](./sending-emails.md) with inline options · [mail classes](./mailables.md) with `send()` · the official `@nestjs/mail` `Mailer` [over our bridges](./nestjs-mail.md) |
| **How emails leave** | [nodemailer](./configuration.md) (SMTP, SES SDK, sendmail, community transports) · built-in [HTTP transports](./http-transports.md) (Resend, Postmark, SendGrid, SES, Mailgun, Brevo) · `@nestjs/mail`'s transports [through `MailModule`](./nestjs-mail.md) |
| **When emails are sent** | Directly, in the request · in the background with the [BullMQ queue](./queue.md) · after your transaction commits with the [transactional outbox](./outbox.md) |
| **Templates** | Inline HTML or the [`html` tag](./sending-emails.md#safe-html-with-the-html-tag) · a [template adapter](./adapters.md) (Handlebars, Pug, EJS, MJML, Liquid, Nunjucks) |
| **Development and tests** | [`TestMailbox`](./testing.md) · [`FileTransport` / `LogTransport`](./dev-transports.md) · [browser previews](./preview.md) |

Not sure? Start with `sendMail()` over SMTP or an HTTP transport, sent directly. Add mail classes, a queue or the outbox when you need them.

## Requirements

- NestJS 11 or 12
- nodemailer 8 or later
- NestJS 12 is ESM-only and requires Node.js >= 20.19 (or >= 22.12); this CommonJS package loads it through Node.js' native `require(esm)`. To run Jest on a NestJS 12 project use Node.js >= 24.9 with `NODE_OPTIONS=--experimental-vm-modules`.

## Installation

Install the core package and nodemailer:

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

Install the TypeScript types for nodemailer:

```bash
pnpm add -D @types/nodemailer
```

### Template Engines (optional)

Template engines are optional peer dependencies and are **not** installed automatically. Install the engine(s) you plan to use:

```bash
# Handlebars
pnpm add handlebars

# Pug
pnpm add pug

# EJS
pnpm add ejs

# Liquid
pnpm add liquidjs

# MJML (responsive emails)
pnpm add mjml

# Nunjucks
pnpm add nunjucks

# Email previews in development (`preview` option)
pnpm add -D preview-email
```

## Basic Usage

Import `MailerModule` into your root `AppModule`:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'username',
          pass: 'password',
        },
      },
      defaults: {
        from: '"No Reply" <noreply@example.com>',
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

Then inject and use `MailerService`:

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(email: string, name: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Welcome!',
      template: 'welcome',
      context: { name },
    });
  }
}
```

## Mail Classes

For emails you send from more than one place, write a [mail class](./mailables.md): a typed provider that renders the email from data.

```typescript
import { Injectable } from '@nestjs/common';
import { Mailable } from '@nestjs-modules/mailer';

@Injectable()
export class WelcomeMail implements Mailable<{ name: string }> {
  render({ name }: { name: string }) {
    return { subject: `Welcome, ${name}!`, template: 'welcome', context: { name } };
  }
}
```

```typescript
await this.mailerService.send(WelcomeMail, { to: email, data: { name } });
```

## Testing

`MailerTestModule` runs the real mailer without sending anything, and its `TestMailbox` captures every email for assertions:

```typescript
import { Test } from '@nestjs/testing';
import { MailerTestModule, TestMailbox } from '@nestjs-modules/mailer';

const moduleRef = await Test.createTestingModule({
  imports: [MailerTestModule.register()],
  providers: [NotificationService],
}).compile();

await moduleRef.get(NotificationService).sendWelcomeEmail('ada@example.com', 'Ada');
moduleRef.get(TestMailbox).assertSent({ to: 'ada@example.com', subject: 'Welcome!' });
```

See [Testing](./testing.md) for queries, links, attachments and simulated failures.

## Next Steps

- [Configuration](./configuration.md): async setup, multiple transporters, every option
- [Reliability](./reliability.md): retries, failover, idempotency
- [Delivery rules](./delivery-rules.md): staging interception, suppression, unsubscribe
- [Dev transports](./dev-transports.md) and [email previews](./preview.md) for local development
- [Interop with `@nestjs/mail`](./nestjs-mail.md)
