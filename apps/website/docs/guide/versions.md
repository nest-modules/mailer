---
title: Versions & upgrading
---

# Versions & upgrading

`@nestjs-modules/mailer` has three documented major versions. This page tells you which one you are on, what each supports, what changed between them and how to upgrade. The docs for older versions stay online: [v3](/v3/) and [v2](/v2/).

Not sure which one you have? Run `pnpm why @nestjs-modules/mailer` (or `npm ls @nestjs-modules/mailer`) and look at the major version.

## Support status

| Version | Status | What it gets | Docs |
| --- | --- | --- | --- |
| **v4** | Current | New features, bug fixes and security fixes | [Guide](./getting-started.md) |
| **v3** (3.0.x) | Maintenance | Security fixes for now; no new features | [v3 docs](/v3/) |
| **v2** (2.3.x) | End of life | Nothing, including security fixes | [v2 docs](/v2/) |

New projects should start on v4. If you are on v2, upgrade: it misses the [security fixes of 3.0](./migration-v3.md#security-hardening).

## Requirements

| | v4 | v3 | v2 |
| --- | --- | --- | --- |
| NestJS | 11 – 12 | 7 – 12 | 7 – 11 |
| Node.js | 20 or later; NestJS 12 needs >= 20.19 (or >= 22.12) | 20 or later; NestJS 12 needs >= 20.19 (or >= 22.12) | No constraint declared; tested on 20, 22, 24 |
| nodemailer | >= 8.0.5 | >= 8.0.5 | >= 8.0.5 (2.3.10) |
| Template engines | Optional peers, install your own | Optional peers, install your own | Installed automatically |
| `ejs` / `pug` floor | `>= 3.1.10` / `>= 3.0.3` | `>= 3.1.10` / `>= 3.0.3` | `>= 3.1.2` / `>= 3.0.1` |

## Install

Pin the major you want. A plain `pnpm add @nestjs-modules/mailer` installs the latest (v4).

::: code-group

```bash [v4 (pnpm)]
pnpm add @nestjs-modules/mailer@^4 nodemailer
```

```bash [v3 (pnpm)]
pnpm add @nestjs-modules/mailer@^3 nodemailer
```

```bash [v2 (pnpm)]
pnpm add @nestjs-modules/mailer@^2 nodemailer
```

```bash [npm]
npm install @nestjs-modules/mailer@^4 nodemailer   # or @^3, @^2
```

```bash [yarn]
yarn add @nestjs-modules/mailer@^4 nodemailer      # or @^3, @^2
```

:::

With v3 and v4, also install the template engine your adapter uses, for example `pnpm add handlebars`.

## What changed

The `MailerModule.forRoot()` / `sendMail()` API is the same in all three versions. The differences are in defaults and in what is available:

| | v2 | v3 | v4 |
| --- | --- | --- | --- |
| Template engine installation | All installed automatically | Install the one you use | Install the one you use |
| Inline `html` <code v-pre>{{key}}</code> | Inserted as-is | HTML-escaped (<code v-pre>{{{key}}}</code> for raw) | HTML-escaped, plus the [`html` tag](./sending-emails.md#safe-html-with-the-html-tag) |
| Remote stylesheets in CSS inlining | Fetched | Not fetched (`loadRemoteStylesheets`) | Not fetched |
| Local stylesheets and `textTemplate` | Any path | Only inside `template.dir` / `cssBaseUrl` | Only inside `template.dir` / `cssBaseUrl` |
| i18n locale | Used as given | Validated (BCP 47-like) | Validated, falls back `es-CO` → `es` |
| Pug compiler options | From `template.options` and `context` | `template.options` only | `template.options` only |
| Health indicator on failure | Returns the error message | Logs it, returns `down` only | Logs it, returns `down` only |
| [Mail classes](./mailables.md) (`send(WelcomeMail, …)`) | No | No | Yes |
| [Retries](./reliability.md) | None, one attempt | None, one attempt | 3 attempts with backoff by default (`retry: false` for v3 behavior) |
| Failover, `AbortSignal`, `idempotencyKey` | No | No | [Yes](./reliability.md) |
| [Errors](./errors.md) | Raw nodemailer errors | Raw nodemailer errors | Typed `MailerError` subclasses (`wrapErrors: false` for raw) |
| Plain-text part from HTML | No | No | Yes (`textFromHtml: false` to opt out) |
| Message [validation](./errors.md#validation) | No | No | Yes (`validate: false` to opt out) |
| `MailerTestModule` transport | nodemailer `streamTransport` | nodemailer `streamTransport` | [`TestMailbox`](./testing.md) with assertions |
| Email previews | `preview` option (`preview-email`) | `preview` option (`preview-email`) | `preview` option and [`MailerPreviewModule`](./preview.md) at `/_mailer` |
| [Dev transports](./dev-transports.md) (`FileTransport`, `LogTransport`) | No | No | Yes |
| [Delivery rules](./delivery-rules.md) (`intercept`, `suppress`, `unsubscribe`) | No | No | Yes |
| `@OnEvent()` listeners with `@nestjs/event-emitter` | Never fired | Never fired | Fire; plus `events$`, `RETRY`, `FAILOVER`, `SUPPRESSED` ([events](./events.md)) |
| [Interop with `@nestjs/mail`](./nestjs-mail.md) | No | No | Yes |
| [Transactional outbox](./outbox.md) (`@nestjs/outbox`) | No | No | Yes |
| [HTTP transports](./http-transports.md) (Resend, Postmark, SendGrid, SES, Mailgun, Brevo) | No | No | Yes |
| BullMQ [queue](./queue.md) | Yes | Yes | Yes, plus `schedule()`, `concurrency`, permanent failures fail the job |
| NestJS 11 | Yes | Yes | Yes |
| NestJS 12 | No | Yes | Yes |

## Upgrade path

Upgrade one major at a time, or apply both migration guides at once if you go from v2 to v4:

1. **v2 → v3**: [Migrating from v2 to v3](./migration-v3.md). Install your template engine, switch trusted inline placeholders to <code v-pre>{{{key}}}</code>, check remote or out-of-directory stylesheets, move Pug compiler options to `template.options`. Docs: [v3](/v3/).
2. **v3 → v4**: [Migrating to v4](./migration.md). Retries are on by default, errors are typed, messages are validated and get a plain-text part. Each new default has a one-line opt-out. Docs: [v4 guide](./getting-started.md).

The release notes for every version are in the [changelog](https://github.com/nest-modules/mailer/blob/main/packages/mailer/CHANGELOG.md).
