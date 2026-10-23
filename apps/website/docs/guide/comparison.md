---
title: Comparison with @nestjs/mail
---

# Comparison with `@nestjs/mail`

Two NestJS mail packages now exist: this one, `@nestjs-modules/mailer` (community-maintained, built on nodemailer), and the official [`@nestjs/mail`](https://trilon.io/blog/sending-email-with-nestjs-mail) (NestJS team, first released as 0.0.1, no third-party dependencies). This page compares `@nestjs-modules/mailer` v4 with `@nestjs/mail` 0.0.1 as honestly as we can, so you can pick the right one, or [use both together](./nestjs-mail.md). If something here is out of date, please [open an issue](https://github.com/nest-modules/mailer/issues).

## At a glance

| | `@nestjs-modules/mailer` v4 | `@nestjs/mail` 0.0.1 |
| --- | --- | --- |
| Foundation | nodemailer | Its own SMTP client and MIME builder on Node.js built-ins |
| Runtime dependencies | nodemailer, `css-inline`, `glob` (+ the template engine you choose); the HTTP transports themselves add none | **None** |
| Module format | CommonJS (loads ESM-only NestJS 12 via `require(esm)`) | ESM only |
| NestJS | 11 and 12 | 11 and 12 |

## Features

| Feature | `@nestjs-modules/mailer` v4 | `@nestjs/mail` 0.0.1 |
| --- | --- | --- |
| **Template engines** | Handlebars, Pug, EJS, MJML, Liquid, Nunjucks, with CSS inlining; custom resolvers (DB, S3) | `FileTemplateEngine` (logic-less HTML: escaping, conditionals, loops, partials), or your own engine |
| **`html` tag, plain text from HTML** | Yes (`html`, `unsafeHtml()`, `textFromHtml`) | Yes |
| **SMTP and nodemailer transports** | Anything nodemailer supports: SMTP (pooled), SES SDK, sendmail, streams, community transports | Its own SMTP client |
| **HTTP provider transports** | Built-in, zero-dependency: Resend, Postmark, SendGrid, SES, **Mailgun**, **Brevo** | Built-in: Resend, Postmark, SendGrid, SES |
| **Dev and test transports** | `FileTransport`, `LogTransport`, `TestMailbox` | `FileMailTransport`, `LogMailTransport`, `InMemoryMailTransport` |
| **Warning for a non-delivering transport in production** | Yes | Yes |
| **Typed mail classes** | Yes (`Mailable`), same shape | Yes (`Mailable`) |
| **Render without sending** | Yes (`render()`) | Yes (`render()`) |
| **Typed errors with `permanent` flag** | Yes (`MailerError` and subclasses) | Yes (`MailError` and subclasses) |
| **Message validation before sending** | Yes (`validate`) | Yes |
| **Retries with backoff** | Yes, on by default (3 attempts), transient/permanent classification, `Retry-After`, duplicate protection for ambiguous failures | Yes, on by default (3 attempts), transient/permanent classification, `Retry-After` |
| **Abort signal, idempotency key** | Yes | Yes |
| **Graceful shutdown (`drain()`)** | Yes (`shutdownTimeout`) | Yes |
| **Failover between transports** | Yes (`failover`) | No |
| **Multiple named transports** | Yes, also added at runtime | One transport per module |
| **Transactional outbox** | Yes, through `@nestjs/outbox` ([`MailerOutboxModule`](./outbox.md)) | Yes, through `@nestjs/outbox` |
| **Background queue** | BullMQ queue with scheduling, priorities and `concurrency` (needs Redis) | No |
| **Batch sending** | Yes (`MailerBatchService`, concurrency and rate limit) | No |
| **Staging interception** | Yes (`intercept`) | No |
| **Suppression lists** | Yes (`suppress`) | No |
| **One-click unsubscribe (RFC 8058)** | Yes (`unsubscribe`) | No dedicated option (set the headers yourself) |
| **Test mailbox with assertions** | Yes (`MailerTestModule`, `TestMailbox`) | Yes (`InMemoryMailTransport`) |
| **Preview UI in the browser** | Yes (`MailerPreviewModule`), plus `preview-email` integration | No |
| **Events** | Before send, after send, error, retry, failover, suppressed, queue events; RxJS `events$`, `@nestjs/event-emitter`, `diagnostics_channel` | Sent and failed; `events$` and `diagnostics_channel` |
| **Health check** | Yes (`MailerHealthIndicator` for `@nestjs/terminus`) | No health indicator (`SmtpTransport` has a `verify()` you can call) |
| **i18n** | Folder per locale, region → language fallback, default-locale fallback | Locale suffix on template names (`welcome.es.html`) |
| **DKIM** | Yes (nodemailer `dkim`) | Yes (SMTP transport) |
| **nodemailer plugins** | Yes | No |

## Choosing

- Choose **`@nestjs/mail`** for a new project when its built-in transports and template engine cover your needs and you value zero dependencies and an official package.
- Choose **`@nestjs-modules/mailer`** when you need richer template engines, nodemailer transports or plugins, Mailgun or Brevo, failover, staging interception, suppression, a browser preview, batches or a Redis-backed queue, or when you already use it.
- Combine them with the [`@nestjs-modules/mailer/nestjs-mail`](./nestjs-mail.md) adapters: `@nestjs/mail`'s API with nodemailer transports, this module's delivery features or its template engines.
