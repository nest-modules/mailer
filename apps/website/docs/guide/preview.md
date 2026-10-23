---
title: Email previews (module)
---

# Email previews (module)

`MailerPreviewModule` serves your app's real emails in the browser while you develop: register a list of previews (a mail class with sample data, or plain send options) and open `http://localhost:3000/_mailer` (with `NODE_ENV=development`) to see each one rendered with your templates, styles and inline images, in HTML and plain text, in any locale. Nothing is sent. New in v4.

::: info
This page is about the preview module inside your application. The [Playground](../preview.md) on this site is a different thing: an interactive editor to try template syntax in the browser.
:::

## Setup

`MailerPreviewModule` uses the `MailerService` of your `MailerModule`, so import both:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule, MailerPreviewModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'node:path';
import { WelcomeMail } from './mail/welcome.mail';
import { OrderShippedMail } from './mail/order-shipped.mail';
import { sampleOrder } from './mail/fixtures';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: process.env.SMTP_URL,
      template: { dir: join(__dirname, 'templates'), adapter: new HandlebarsAdapter() },
    }),
    MailerPreviewModule.register({
      // On by default only when NODE_ENV is 'development' or 'test'
      previews: [
        {
          name: 'welcome',
          description: 'Sent right after sign-up',
          mailable: WelcomeMail,
          data: { name: 'Ada', verifyUrl: 'https://app.example.com/verify?token=demo' },
        },
        {
          name: 'order-shipped',
          mailable: OrderShippedMail,
          data: () => sampleOrder(), // a function, called on every request
          locale: 'es',
        },
        {
          name: 'password-reset',
          mail: {
            subject: 'Reset your password',
            template: 'password-reset',
            context: { url: 'https://app.example.com/reset?token=demo' },
          },
        },
      ],
    }),
  ],
})
export class AppModule {}
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `previews` | | The emails to list (see below) |
| `path` | `'_mailer'` | Route prefix |
| `enabled` | `true` only when `NODE_ENV` is `development` or `test` | When `false`, the module registers no routes. Left unset outside those environments, it logs how to turn previews on |

Each preview is one of:

- `{ name, description?, mailable, data?, locale? }`: a [mail class](./mailables.md), rendered with `data` (a value, or a function returning it, possibly async);
- `{ name, description?, mail }`: send options, or a function returning them (possibly async).

## Routes

| Route | Returns |
| --- | --- |
| `GET /_mailer` | An index of every preview, with links |
| `GET /_mailer/:name` | The HTML body. `cid:` inline images are embedded as data URLs so the browser can show them. Text-only emails are shown in a `<pre>` |
| `GET /_mailer/:name/text` | The plain-text body |

Add `?locale=fr` to either body route to render the preview in another locale. An unknown name returns 404.

Links in the index are built from the request URL, so they keep working behind a global prefix (`app.setGlobalPrefix('api')` serves `/api/_mailer`) or a proxy path.

::: warning
The routes have no authentication, so the module is **off unless `NODE_ENV` is `development` or `test`**: with `NODE_ENV` unset, `staging` or `production`, it registers nothing and logs a hint. `nest start` doesn't set `NODE_ENV`, so set it in your dev script (`NODE_ENV=development nest start --watch`) or pass `enabled` from your configuration. To serve previews elsewhere (a staging server), set `enabled: true` and protect the route yourself. Previews render with the data you give them, so keep it to fixtures.
:::

## How it renders

Each request calls [`mailerService.render()`](./mailables.md#rendering-without-sending), the same code path as sending: subject interpolation, templates, i18n, the template resolver and CSS inlining all apply. Delivery rules (interception, suppression, unsubscribe headers) do not, because nothing is sent.
