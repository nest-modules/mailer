---
title: v3 documentation
---

<VersionBanner version="3" />

# v3 documentation

These are the docs for `@nestjs-modules/mailer` **3.0.x**, archived as they were for the last v3 release (3.0.2). v3 is in maintenance: it gets security fixes for now, and new features land in v4. See [Versions & upgrading](/guide/versions) for the support status.

## Install

Pin the major version so a fresh install doesn't pull v4:

::: code-group

```bash [pnpm]
pnpm add @nestjs-modules/mailer@^3 nodemailer
```

```bash [npm]
npm install @nestjs-modules/mailer@^3 nodemailer
```

```bash [yarn]
yarn add @nestjs-modules/mailer@^3 nodemailer
```

:::

Template engines are optional peer dependencies and are not installed automatically. Add the one your adapter uses, for example `pnpm add handlebars`.

## Requirements

| | v3 |
| --- | --- |
| NestJS | 7 – 12 (tested on 11 and 12) |
| Node.js | 20 or later (tested on 20, 22 and 24). NestJS 12 needs Node.js >= 20.19 (or >= 22.12) |
| nodemailer | >= 8.0.5 |
| Template engines | Optional peers: `handlebars >= 4.7.9`, `pug >= 3.0.3`, `ejs >= 3.1.10`, `liquidjs >= 10.25.5`, `nunjucks >= 3.2.0`, `mjml >= 4.15.3` |
| Optional integrations | `@nestjs/event-emitter >= 2`, `@nestjs/terminus >= 10`, `bullmq >= 4`, `preview-email >= 3.0.19` |

## Pages

- [Getting started](/v3/getting-started)
- [Configuration](/v3/configuration)
- [Template adapters](/v3/adapters)
- [Sending emails](/v3/sending-emails)
- [Advanced](/v3/advanced)
- [Internationalization (i18n)](/v3/i18n)
- [Events](/v3/events)
- [Batch sending](/v3/batch-sending)
- [Email queue](/v3/queue)
- [Health check](/v3/health-check)
- [Template resolver](/v3/template-resolver)

## Upgrading

- Coming from v2? Read [Migrating from v2 to v3](/guide/migration-v3).
- Ready for v4? Read [Migrating to v4](/guide/migration). v4 keeps the v3 API; a few defaults changed (retries, typed errors, validation, plain-text part).
