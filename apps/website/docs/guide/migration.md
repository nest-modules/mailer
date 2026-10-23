---
title: Migrating to v4
---

# Migrating to v4

v4 keeps the v3 API: `MailerModule.forRoot()`, `sendMail()`, templates, adapters and the queue work as before. A few defaults and signatures changed, mostly to make delivery reliable and safe out of the box. Every new default can be switched back with one option: `retry: false`, `wrapErrors: false`, `validate: false`, `textFromHtml: false`. This page lists every breaking change with the one-line fix, then explains how to move over from the official `@nestjs/mail`.

::: tip Coming from v2?
Migrate to v3 first with [Migrating from v2 to v3](./migration-v3.md), or apply both lists in one go. [Versions & upgrading](./versions.md) compares v2, v3 and v4 side by side.
:::

## Requirements

- NestJS 11 or 12. NestJS 12 is ESM-only; this CommonJS package loads it through Node.js' `require(esm)`, which needs Node.js >= 20.19.
- nodemailer 8 or later.

```bash
pnpm add @nestjs-modules/mailer@^4
```

## Breaking changes

### Retries are on by default

v3 sent each email once. v4 retries transient failures (timeouts, dropped connections, SMTP 4xx, HTTP 429/5xx): **3 attempts** in total, 1s doubling to 30s with jitter. Permanent failures (SMTP 5xx, template errors) still fail at once.

A send that used to fail fast may now take a few seconds longer to reject. To keep the v3 behavior:

```typescript
MailerModule.forRoot({
  transport: process.env.SMTP_URL,
  retry: false,
});
```

If you wrapped `sendMail()` in your own retry loop, remove it or set `retry: false`, otherwise attempts multiply.

[Queued](./queue.md) emails are unaffected: jobs are sent with `retry: false` and BullMQ keeps owning their retries. See [Reliability](./reliability.md) for the options.

### Event payloads have extra fields

`MailerEventPayload` gains `attempt`, `permanent`, `transporterName`, `durationMs` and `suppressed`, and there are three new events: `mailer.retry`, `mailer.failover` and `mailer.suppressed`. Existing fields are unchanged. Code that serializes or strictly validates payloads, or switches exhaustively over `MailerEvent`, may need updating. With retries on, `mailer.send_error` fires once per failed send, after the last attempt; listen to `mailer.retry` for the intermediate failures. See [Events](./events.md).

### `@nestjs/event-emitter` now receives events

In v3, `MailerEventService` never actually got the `EventEmitter2` instance, so `@OnEvent(MailerEvent.*)` listeners did not fire. In v4 it is found automatically when `EventEmitterModule` is imported. If you had listeners that silently never ran, they will start running after the upgrade; check that they are ready for it.

### `MailerEventService` constructor

The constructor is now `(eventEmitter?: MailerEventEmitter, moduleRef?: ModuleRef)`, and the emitter is injected through the `MAILER_EVENT_EMITTER` token. If you provided a custom emitter, provide it under that token (see [another emitter](./events.md#another-emitter)). `new MailerEventService(emitter)` in unit tests still works.

### Errors are typed

Failures from a transport are thrown as [typed errors](./errors.md): `MailerSmtpError`, `MailerTimeoutError`, `MailerConnectionError`, `MailerRecipientsRejectedError`, `MailerProviderError`…, all extending `MailerError`. The original error is kept as `cause`, and nodemailer's fields (`code`, `responseCode`, `response`, `command`, `rejected`) are copied over, so checks like `error.responseCode === 550` keep working. What changes is the class and `name`: code that tested `error instanceof SomeNodemailerClass`, compared `error.name`, or matched on the stack needs updating, or set `wrapErrors: false` to get the raw errors back. Configuration errors (an unknown transporter) and aborts are thrown as before.

### Messages are validated

Malformed addresses, line breaks in addresses, the subject or headers, and invalid header names now fail with a `MailerMessageError` before sending (see [Validation](./errors.md#validation)). v3 passed them to nodemailer as they were. If you relied on that (for example local test addresses without a domain), fix the data or set `validate: false`.

### Emails get a plain-text part

An email with HTML and no `text` now gets a plain-text part derived from the HTML (see [Plain-text part](./sending-emails.md#plain-text-part)). This improves deliverability, but changes the MIME structure (`multipart/alternative`) and any snapshot of it. Set `textFromHtml: false` to keep the v3 output.

### Timeouts

The error thrown when `sendTimeout` or `timeout` elapses is now a `MailerTimeoutError` with `code: 'ETIMEDOUT'` and `timeoutMs` (the message is unchanged: `Send mail timed out after <ms>ms`). `sendTimeout` applies to each attempt.

Because the abandoned attempt may still deliver the email, a timeout, or a connection dropped while the message was being sent, is **retried only when the email has a stable `Message-ID`** (`idempotencyKey` or `messageId`). Without one it fails at once. Add an `idempotencyKey` to emails that should be retried in that case (see [duplicate protection](./reliability.md#duplicate-protection)).

### `MailerTestModule`

- `register()` now takes any `MailerOptions` except `transport`/`transports` (v3 only took `template`).
- `retry` defaults to `false` in the test module.
- The transport is now the module's [`TestMailbox`](./testing.md), which is also provided and exported. v3 used nodemailer's `streamTransport` with unix newlines: the send result's `message` is now the raw MIME with **CRLF** line endings. Tests that asserted the stream transport options in `MAILER_OPTIONS`, or compared `info.message` with `\n` line breaks, need updating; prefer asserting with `TestMailbox`.

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [MailerTestModule.register({ defaults: { from: 'app@example.com' } })],
}).compile();

moduleRef.get(TestMailbox).assertSent({ to: 'ada@example.com' });
```

### Mail class context

`MailableContext.to` (the second argument of `render()`) is a list of parsed recipients, `{ name?, address }`, the same shape as `@nestjs/mail`. If you wrote mail classes against a v4 prerelease where it was a list of strings, use `to[0]?.address` instead of `to[0]`.

### Email preview module defaults

`MailerPreviewModule` (new in v4) is on by default only when `NODE_ENV` is `development` or `test`. With `NODE_ENV` unset, as with a plain `nest start`, it serves nothing until you set `NODE_ENV=development` or `enabled: true` (see [Email previews](./preview.md)).

## Fixed

- Text-only emails (`text` without `html` or `template`) no longer fail when a template adapter is configured.
- i18n falls back from a region to its language (`es-CO` → `es`), and `.mjml` templates are found for localized lookups.

## New in v4

None of these require changes; adopt them when useful:

- [Mail classes](./mailables.md) and `render()`
- [Reliability](./reliability.md): retries, failover, `signal`, `idempotencyKey`
- [Delivery rules](./delivery-rules.md): `intercept`, `suppress`, `unsubscribe`
- [Testing](./testing.md) with `TestMailbox`, [dev transports](./dev-transports.md), [email previews](./preview.md)
- [Queue](./queue.md): `schedule()`, `concurrency`, permanent failures fail the job at once
- [HTTP transports](./http-transports.md) and the [transactional outbox](./outbox.md)
- [Errors and validation](./errors.md), the [`html` tag](./sending-emails.md#safe-html-with-the-html-tag), graceful [shutdown](./configuration.md#shutdown)
- [Interop with `@nestjs/mail`](./nestjs-mail.md)

## Coming from `@nestjs/mail`

If you started with the official `@nestjs/mail` and need something it does not have (another template engine, a nodemailer transport, failover, staging interception, a preview UI), you do not have to rewrite anything at once. Pick the smallest step:

1. **Keep `@nestjs/mail`, change the transport.** [`NodemailerMailTransport`](./nestjs-mail.md#_1-nodemailer-transports-for-nestjs-mail) gives it any nodemailer transport; [`MailerServiceTransport`](./nestjs-mail.md#_2-deliver-through-mailerservice) routes it through `MailerModule` for failover, interception and suppression.
2. **Keep `@nestjs/mail`, change the templates.** [`TemplateAdapterEngine`](./nestjs-mail.md#_3-template-engines-for-nestjs-mail) renders Handlebars, Pug, EJS, MJML, Liquid or Nunjucks. Suffix-localized names (`welcome.es.hbs`) keep working.
3. **Move to `MailerService`.** Your mail classes keep working with `mailerService.send(MailClass, { to, data })`. The render context has the same shape and `@nestjs/mail`'s `SafeHtml` is accepted as `html`; mind the remaining [differences](./nestjs-mail.md#migrating-mail-classes), mostly that templates use the adapter you configure.

The concepts map one to one:

| `@nestjs/mail` | `@nestjs-modules/mailer` |
| --- | --- |
| `MailModule.forRoot({ transport, from })` | `MailerModule.forRoot({ transport, defaults: { from } })` |
| `Mailer#send()` / `Mailer#render()` | `MailerService#send()` / `MailerService#render()` |
| `Mailable`, `MailRenderContext` | `Mailable`, `MailableContext` |
| `retry`, `signal`, `idempotencyKey` | `retry`, `signal`, `idempotencyKey` (same semantics and defaults) |
| `FileTemplateEngine` | A [template adapter](./adapters.md) |
| `InMemoryMailTransport` | `MailerTestModule` + `TestMailbox` |
| `FileMailTransport`, `LogMailTransport` | `FileTransport`, `LogTransport` |
| `ResendTransport`, `PostmarkTransport`, `SendGridTransport`, `SesTransport` | The [HTTP transports](./http-transports.md) of the same names, plus `MailgunTransport` and `BrevoTransport` |
| `html` tag, `unsafeHtml()` | [`html`, `unsafeHtml()`](./sending-emails.md#safe-html-with-the-html-tag) |
| `MailError` and subclasses (`permanent`, numeric `code`) | [`MailerError`](./errors.md) and subclasses (`permanent`, string `code` such as `EAUTH`) |
| `@nestjs/outbox` with `Mailer` | [`MailerOutboxModule`](./outbox.md) |
| `MailEvents#events$` (`sent`, `failed`) | `MailerEventService#events$` (`mailer.after_send`, `mailer.send_error`, …) |
