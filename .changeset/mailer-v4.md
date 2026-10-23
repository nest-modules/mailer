---
'@nestjs-modules/mailer': major
---

v4: everything the official `@nestjs/mail` offers and more, without dropping anything v3 supports. Every capability is optional: use nodemailer, the built-in HTTP providers or `@nestjs/mail`'s transports; send directly, through BullMQ or through `@nestjs/outbox`; call `sendMail`, mail classes or the official `Mailer` over this module.

**Breaking changes** (see the [migration guide](https://nest-modules.github.io/mailer/guide/migration)):

- Transient failures are retried by default (3 attempts with backoff); `retry: false` restores v3. A timeout or a dropped connection while the message was being handed over is retried only when the email has a stable Message-ID (`idempotencyKey`), so nothing is sent twice. `sendTimeout` applies per attempt.
- Errors from transports are typed (`MailerSmtpError`, `MailerTimeoutError`, … all `MailerError`), keeping nodemailer's fields and the original as `cause`; `wrapErrors: false` restores v3.
- Emails without a text part get one derived from the HTML (`textFromHtml: false` to opt out), and messages are validated before sending (`validate: false` to opt out).
- `MailerTestModule` delivers to a `TestMailbox` (no stream transport; `info.message` uses CRLF line endings) and defaults `retry` to `false`.
- `MailerPreviewModule` is on by default only when `NODE_ENV` is `development` or `test`.
- Event payloads carry `attempt`, `permanent`, `transporterName` and `durationMs`; `MailerEventService` takes its emitter through `MAILER_EVENT_EMITTER`, and `EventEmitter2` is found automatically (in v3 it was never injected).
- `MailableContext.to` is `{ name?, address }[]`, the same shape as `@nestjs/mail`.

**New**

- Mail classes (`mailerService.send(WelcomeMail, { to, data })`) compatible with `@nestjs/mail`'s, with dependencies resolved from the whole app, and `render()` to render without sending.
- Retries with backoff and error classification (nodemailer, HTTP and AWS SDK errors), failover between transporters, `AbortSignal`, `idempotencyKey`, and graceful shutdown that waits for sends in flight (`shutdownTimeout`).
- Zero-dependency HTTP transports: Resend, Postmark, SendGrid, SES (SigV4), Mailgun and Brevo.
- The `html` tagged template (`unsafeHtml()` for trusted markup), `htmlToText()` and message validation.
- `intercept` (redirect recipients in staging), `suppress` (suppression lists) and one-click `unsubscribe` (RFC 8058).
- `TestMailbox` with assertions, `FileTransport` and `LogTransport` (with a warning when used in production) and `MailerPreviewModule` to preview emails in the browser.
- `events$`, `node:diagnostics_channel` publishing (credentials redacted), and `RETRY`, `FAILOVER` and `SUPPRESSED` events.
- BullMQ: permanent failures fail the job at once, a stable idempotency key per job, `schedule()` and `concurrency`.
- `@nestjs-modules/mailer/nestjs-mail`: `NodemailerMailTransport`, `MailerServiceTransport` and `TemplateAdapterEngine` for `@nestjs/mail`.
- `@nestjs-modules/mailer/outbox`: transactional sending with `@nestjs/outbox`.
- i18n falls back from a region to its language (`es-CO` → `es`) and searches every template directory.
- Tested on NestJS 11 and 12.

**Fixed**

- Text-only emails no longer fail when a template adapter is configured.
- `intercept` and `suppress` cover the whole custom envelope (`to`, `cc` and `bcc`).
