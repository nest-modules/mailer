---
title: v2 documentation
---

<VersionBanner version="2" />

# v2 documentation

These are the docs for `@nestjs-modules/mailer` **2.3.x**, archived as they were for the last v2 release (2.3.10). v2 is end of life: it gets no more fixes, including security fixes. Plan an upgrade to v4, through v3 (see [Versions & upgrading](/guide/versions#upgrade-path)).

## Install

Pin the major version so a fresh install doesn't pull v4:

::: code-group

```bash [pnpm]
pnpm add @nestjs-modules/mailer@^2 nodemailer
```

```bash [npm]
npm install @nestjs-modules/mailer@^2 nodemailer
```

```bash [yarn]
yarn add @nestjs-modules/mailer@^2 nodemailer
```

:::

In v2 every template engine (`ejs`, `handlebars`, `liquidjs`, `mjml`, `nunjucks`, `pug`, `preview-email` and their types) is installed automatically as an optional dependency.

## Requirements

| | v2 (2.3.10) |
| --- | --- |
| NestJS | 7 – 11 (NestJS 12 support was added in 3.0.0) |
| Node.js | No `engines` constraint; 2.3.x was tested on Node.js 20, 22 and 24 |
| nodemailer | >= 8.0.5 |
| Template engines | Installed automatically; peer floors `handlebars >= 4.7.9`, `pug >= 3.0.1`, `ejs >= 3.1.2`, `liquidjs >= 10.25.5`, `nunjucks >= 3.2.0`, `mjml >= 4.15.3` |
| Optional integrations | `@nestjs/event-emitter >= 2`, `@nestjs/terminus >= 10`, `bullmq >= 4` |

::: warning Known issues fixed in v3
The `ejs` and `pug` floors of v2 allow versions with known template-injection CVEs, and v2 does not escape <code v-pre>{{key}}</code> placeholders in inline `html`, fetches remote stylesheets when inlining CSS and does not validate i18n locales. These were fixed in [3.0.0](/guide/migration-v3).
:::

## Pages

- [Getting started](/v2/getting-started)
- [Configuration](/v2/configuration)
- [Template adapters](/v2/adapters)
- [Sending emails](/v2/sending-emails)
- [Advanced](/v2/advanced)
- [Internationalization (i18n)](/v2/i18n)
- [Events](/v2/events)
- [Batch sending](/v2/batch-sending)
- [Email queue](/v2/queue)
- [Health check](/v2/health-check)
- [Template resolver](/v2/template-resolver)

## Upgrading

1. [Migrate from v2 to v3](/guide/migration-v3): template engines, inline <code v-pre>{{key}}</code> escaping, remote stylesheets, Pug options, health check output.
2. [Migrate from v3 to v4](/guide/migration): retries on by default, typed errors, validation, plain-text part.
