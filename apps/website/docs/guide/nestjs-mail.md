---
title: Interop with @nestjs/mail
---

# Interop with `@nestjs/mail`

The NestJS team publishes an official mail package, [`@nestjs/mail`](https://trilon.io/blog/sending-email-with-nestjs-mail) by Kamil Myśliwiec: a dependency-free SMTP client and MIME builder with HTTP transports, typed mail classes, retries and an in-memory test transport. `@nestjs-modules/mailer` v4 does not compete with it on its own ground; it plugs into it. The `@nestjs-modules/mailer/nestjs-mail` entry point gives `@nestjs/mail` access to the whole nodemailer ecosystem, to this module's delivery features (failover, interception, suppression, plugins, events) and to its template engines, and mail classes are shaped so the same class works with both libraries.

## When to use which

- **Starting fresh, SMTP or one of its HTTP providers, logic-less templates are enough:** `@nestjs/mail` alone is a good fit, with no dependencies.
- **You need a transport it does not have** (SES SDK, sendmail, Mailgun, Brevo, any nodemailer transport or plugin): use `@nestjs/mail` with [`NodemailerMailTransport`](#_1-nodemailer-transports-for-nestjs-mail).
- **You want Mailgun with `@nestjs/mail`:** wrap this module's [`MailgunTransport`](./http-transports.md) in `NodemailerMailTransport`. `@nestjs/mail` hands over raw MIME, which only `MailgunTransport` and `SesTransport` accept among this module's HTTP transports; the JSON ones (Resend, Postmark, SendGrid, Brevo) refuse raw messages, so with `@nestjs/mail` use its own Resend, Postmark and SendGrid transports. (`MailerServiceTransport` forwards the same raw message, so the JSON transports can't be used behind it either.)
- **You want `@nestjs/mail`'s API but this module's delivery features** (named transporters, failover, staging interception, suppression lists, events, health checks): use [`MailerServiceTransport`](#_2-deliver-through-mailerservice).
- **You want Handlebars, Pug, EJS, MJML, Liquid or Nunjucks templates in `@nestjs/mail`:** use [`TemplateAdapterEngine`](#_3-template-engines-for-nestjs-mail).
- **You already use `@nestjs-modules/mailer`:** keep it. v4 has [mail classes](./mailables.md), [retries](./reliability.md) and a [test mailbox](./testing.md) of its own. See the [comparison](./comparison.md) for the details.

## Installation

```bash
pnpm add @nestjs/mail @nestjs-modules/mailer nodemailer
```

`@nestjs/mail` is an optional peer dependency: you only need it for this entry point. It is published as ES modules; a CommonJS Nest app loads it through Node.js' `require(esm)`, which needs Node.js >= 20.19.

```typescript
import {
  MailerServiceTransport,
  NodemailerMailTransport,
  TemplateAdapterEngine,
} from '@nestjs-modules/mailer/nestjs-mail';
```

This entry point doesn't import `@nestjs/mail`'s types: it declares structural equivalents (`MailMessageLike`, `MailTransportLike`, `MailTemplateEngineLike`, `MailTransportResultLike`, …, exported from the subpath), so CommonJS projects compiled with `moduleResolution: node16`/`nodenext` build without resolving the ESM-only package.

## 1. Nodemailer transports for `@nestjs/mail`

`NodemailerMailTransport` is a `@nestjs/mail` transport that delivers through nodemailer. It takes anything `MailerModule`'s `transport` takes (an SMTP URL or options, a nodemailer transport such as SES or sendmail, a community transport) or an existing nodemailer `Transporter`.

```typescript
import { Module } from '@nestjs/common';
import { MailModule } from '@nestjs/mail';
import { NodemailerMailTransport } from '@nestjs-modules/mailer/nestjs-mail';

@Module({
  imports: [
    MailModule.forRoot({
      transport: new NodemailerMailTransport({
        pool: true,
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user', pass: 'pass' },
      }),
      from: 'App <app@example.com>',
    }),
  ],
})
export class AppModule {}
```

```typescript
import { Injectable } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';

@Injectable()
export class NotificationsService {
  constructor(private readonly mailer: Mailer) {}

  notify(email: string) {
    return this.mailer.send({ to: email, subject: 'Hello', html: '<p>Hello</p>' });
  }
}
```

- The message is sent exactly as `@nestjs/mail` built it: its MIME source and SMTP envelope are handed to nodemailer as `raw`, so the `Message-ID`, DKIM signature and Bcc handling stay `@nestjs/mail`'s.
- Errors are marked with `permanent` using the [same rules](./reliability.md#what-is-retried) as this module (SMTP 5xx is permanent, `ECONNECTION` is transient…), so `@nestjs/mail`'s retries skip what cannot succeed.
- `verify()` checks the connection and credentials (for a health check) and `close()` closes pooled connections.
- `accepted` comes from the transport's result, or from the delivered envelope when the transport reports none (stream and JSON transports).
- The underlying nodemailer transporter is available as `transport.transporter`.

## 2. Deliver through `MailerService`

`MailerServiceTransport` sends `@nestjs/mail` messages through this module's `MailerService`. You write emails with `@nestjs/mail`'s `Mailer` and mail classes; delivery gets `MailerModule`'s named transporters, failover, interception, suppression, nodemailer plugins and events. Import both modules and pass the class (Nest instantiates it and injects `MailerService`):

```typescript
import { Module } from '@nestjs/common';
import { MailModule } from '@nestjs/mail';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailerServiceTransport } from '@nestjs-modules/mailer/nestjs-mail';

@Module({
  imports: [
    MailerModule.forRoot({
      transports: {
        ses: { host: 'email-smtp.eu-west-1.amazonaws.com', port: 587, auth: { user: 'key', pass: 'secret' } },
        backup: { host: 'smtp.backup-provider.com', port: 587, auth: { user: 'user', pass: 'pass' } },
      },
      failover: ['backup'],
      intercept: {
        enabled: process.env.APP_ENV === 'staging',
        to: 'qa@example.com',
        allow: ['@example.com'],
      },
    }),
    MailModule.forRoot({
      // A transporter from `transports`; pass `MailerServiceTransport` for the default `transport`
      transport: MailerServiceTransport.for('ses'),
      from: 'App <app@example.com>',
    }),
  ],
})
export class AppModule {}
```

- `MailerServiceTransport` uses `MailerModule`'s default `transport`; `MailerServiceTransport.for('name')` returns a transport class bound to a named transporter.
- Retries stay with `@nestjs/mail`: this transport sends with `retry: false`, so attempts are never multiplied. Failover between transporters still happens inside one attempt.
- `@nestjs/mail`'s `idempotencyKey` and `signal` are passed on.
- `MailerTestModule` works here too: its `TestMailbox` captures the messages, and matches `to` and `subject` read from the MIME source.

::: warning Known limit
`@nestjs/mail` hands over a finished MIME message. Interception and suppression rewrite its **envelope**, which decides where it is delivered, but not the `To:` header inside the message, and `subjectPrefix` is not applied. An intercepted message reaches the QA inbox showing the original recipient in `To:`.
:::

## 3. Template engines for `@nestjs/mail`

`TemplateAdapterEngine` lets `@nestjs/mail` render templates with this module's adapters: Handlebars (helpers, partials, layouts), Pug, EJS, MJML, Liquid and Nunjucks, with CSS inlining.

```typescript
import { Module } from '@nestjs/common';
import { MailModule } from '@nestjs/mail';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { NodemailerMailTransport, TemplateAdapterEngine } from '@nestjs-modules/mailer/nestjs-mail';
import { join } from 'node:path';

@Module({
  imports: [
    MailModule.forRoot({
      transport: new NodemailerMailTransport('smtps://user:pass@smtp.example.com'),
      from: 'App <app@example.com>',
      templates: new TemplateAdapterEngine({
        adapter: new HandlebarsAdapter({ year: () => new Date().getFullYear() }),
        dir: join(__dirname, 'templates'),
        options: {
          partials: { dir: join(__dirname, 'templates/partials') },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

```typescript
await this.mailer.send({
  to: 'ada@example.com',
  subject: 'Welcome',
  template: 'welcome',
  context: { name: 'Ada' },
  locale: 'es-CO',
});
```

| Option | Description |
| --- | --- |
| `adapter` | One of this module's adapters |
| `dir` | The templates directory |
| `dirs` | More directories to search |
| `templateOptions` | Compile options for the engine (what `MailerOptions.template.options` holds) |
| `options` | Runtime options such as Handlebars `partials` (what `MailerOptions.options` holds) |

Localized templates are found in both layouts: a folder per locale (`es/welcome.hbs`, this module's convention) and a suffix (`welcome.es.hbs`, `@nestjs/mail`'s). A region falls back to its language and then to the unlocalized template: `es-CO` tries `es-CO/welcome`, `welcome.es-CO`, `es/welcome`, `welcome.es`, then `welcome`. A missing or broken template is marked `permanent`, so it is not retried.

The engine returns the rendered HTML; `@nestjs/mail` derives the text part from it.

## Migrating mail classes

Both libraries define a mail class as an injectable with `render(data, { locale, to })`, with the same context shape (`to` is a list of `{ name?, address }`), and accept the same core fields: `subject`, `html` (a string or `SafeHtml`) or `text`, `template` and `context`, `attachments`, `headers`, `from`, `replyTo`. A class written for one works with the other and type-checks with both:

```typescript
import { Injectable } from '@nestjs/common';
import { Mailable, MailableContext } from '@nestjs-modules/mailer';

@Injectable()
export class OrderShippedMail implements Mailable<{ id: number }> {
  render(order: { id: number }, { locale, to }: MailableContext) {
    return {
      subject: `Order #${order.id} shipped`,
      template: 'order-shipped',
      context: { order, locale, customer: to[0]?.name },
    };
  }
}

// @nestjs-modules/mailer
await mailerService.send(OrderShippedMail, { to: 'ada@example.com', data: { id: 42 } });
// @nestjs/mail
await mailer.send(OrderShippedMail, { to: 'ada@example.com', data: { id: 42 } });
```

The differences to watch for:

- **The `html` tag:** both libraries have one, and `MailerService` accepts `@nestjs/mail`'s `SafeHtml` as `html`. Don't mix them inside one template, though: this module's `html` tag only recognizes its own `SafeHtml` as already escaped, so a nested `@nestjs/mail` value would be escaped again.
- **Template syntax:** `@nestjs/mail`'s `FileTemplateEngine` uses its own logic-less HTML templates; this module uses the adapter you configure. Use `TemplateAdapterEngine` to share one set of templates between both.
- **Extra fields:** a class for this module may also return `textTemplate`, `transporterName`, `icalEvent` and `unsubscribe`, which `@nestjs/mail` does not know.
- **Instances:** `MailerService.send()` also accepts a mail class instance; `@nestjs/mail` takes the class.
- **Resolution:** both use a class registered as a provider. For a class that isn't one, `@nestjs/mail` only sees global providers, while `MailerService` resolves its dependencies from anywhere in the app. See [how the class is resolved](./mailables.md#how-the-class-is-resolved).

To test a `@nestjs/mail` setup that delivers through `MailerServiceTransport`, import `MailerTestModule.register()` instead of `MailerModule` and assert with `TestMailbox`. See [Testing](./testing.md).
