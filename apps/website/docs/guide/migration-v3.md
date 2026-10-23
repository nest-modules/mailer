---
title: Migrating from v2 to v3
---

# Migrating from v2 to v3

v3 (3.0.0) keeps the v2 API. It changes how template engines are installed and makes a few defaults secure, so most apps upgrade with no code changes. This page lists every breaking change of 3.0.0 with its fix, taken from the [changelog](https://github.com/nest-modules/mailer/blob/main/packages/mailer/CHANGELOG.md#300).

::: tip Going to v4?
Apply this page first, then [Migrating to v4](./migration.md). You can also upgrade straight from v2 to v4 in one step by applying both lists. See [Versions & upgrading](./versions.md) for the whole picture.
:::

## Requirements

- NestJS 7 – 12 (v2 went up to NestJS 11). NestJS 12 is ESM-only and requires Node.js >= 20.19 (or >= 22.12).
- nodemailer 8.0.5 or later.
- If you use them: `ejs >= 3.1.10` and `pug >= 3.0.3` (raised from `3.1.2` and `3.0.1`, see [peer dependency floors](#peer-dependency-floors)).

::: code-group

```bash [pnpm]
pnpm add @nestjs-modules/mailer@^3
```

```bash [npm]
npm install @nestjs-modules/mailer@^3
```

```bash [yarn]
yarn add @nestjs-modules/mailer@^3
```

:::

## Breaking changes

### Template engines are not installed automatically

In v2, `ejs`, `handlebars`, `liquidjs`, `mjml`, `nunjucks`, `preview-email`, `pug` and their `@types/*` packages were listed as `optionalDependencies`, which npm, pnpm and yarn install by default. Every project got all of them. In v3 they are only optional peer dependencies, so you install the one you use.

Before (v2), this was enough for any adapter:

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

After (v3), add the engine behind your adapter, and `preview-email` if you use the `preview` option:

```bash
pnpm add @nestjs-modules/mailer@^3 nodemailer
pnpm add handlebars          # HandlebarsAdapter
pnpm add -D preview-email    # only with the `preview` option
```

| Adapter | Install |
| --- | --- |
| `HandlebarsAdapter` | `handlebars` |
| `PugAdapter` | `pug` (and `@types/pug` if you need the types) |
| `EjsAdapter` | `ejs` (and `@types/ejs`) |
| `LiquidAdapter` | `liquidjs` |
| `NunjucksAdapter` | `nunjucks` |
| `MjmlAdapter` | `mjml` plus the engine it wraps |

If you already followed the installation guide and installed your engine explicitly, nothing changes. A missing engine fails when the adapter is loaded, with `Cannot find module 'handlebars'` (or the engine you use).

### Placeholders in inline `html` are escaped

When you pass `context` with an inline `html` string (no `template`), <code v-pre>{{key}}</code> placeholders are now HTML-escaped. Use triple braces, <code v-pre>{{{key}}}</code>, for markup you trust. Subjects and text templates are not escaped.

Before (v2), markup in the context was inserted as-is:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  html: '<p>Hi {{name}}</p>{{signature}}',
  context: { name: user.name, signature: '<b>The Team</b>' },
});
```

After (v3), escape by default and opt in per placeholder:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  html: '<p>Hi {{name}}</p>{{{signature}}}',
  context: {
    name: user.name, // escaped
    signature: '<b>The Team</b>', // inserted as-is
  },
});
```

Only the context's own properties are interpolated, so keys like `constructor` are never rendered. Templates rendered by an adapter (Handlebars, Pug, EJS…) are not affected: they keep their engine's escaping rules.

### Remote stylesheets are not fetched

CSS inlining no longer downloads remote stylesheets. `loadRemoteStylesheets` defaults to `false` and stays `false` when you pass your own `inlineCssOptions`. If your templates link a stylesheet over HTTP and you trust every URL in them (none comes from user data), opt back in:

```typescript
new HandlebarsAdapter(undefined, {
  inlineCssOptions: { loadRemoteStylesheets: true },
});
```

Local stylesheets are restricted too: `<link rel="stylesheet">` in Handlebars and EJS templates only reads `.css` files inside `template.dir`, or inside `cssBaseUrl` when you set it. Any other `<link>` (an absolute path or `../` outside that directory) is dropped. If your stylesheets live outside the template directory, point `cssBaseUrl` at a common parent:

```typescript
new HandlebarsAdapter(undefined, {
  cssBaseUrl: join(__dirname, 'assets'),
});
```

### Pug compiles with `template.options` only

The Pug adapter used to merge the `context` into pug's compiler options, so a context value named `basedir`, `filename`, `filters` or `plugins` could change how the template compiled. In v3 only `template.options` reach the compiler. Context values are still available as template variables.

Before (v2), compiler options could come from the context:

```typescript
await this.mailerService.sendMail({
  template: 'welcome',
  context: { name: user.name, basedir: join(__dirname, 'templates') },
});
```

After (v3), set them once in the module options:

```typescript
MailerModule.forRoot({
  transport: process.env.SMTP_URL,
  template: {
    dir: join(__dirname, 'templates'),
    adapter: new PugAdapter(),
    options: { basedir: join(__dirname, 'templates'), pretty: false },
  },
});
```

### The health indicator hides error messages

When transporter verification throws, `MailerHealthIndicator` still reports `"transporters": "down"`, but no longer includes the error message, which could contain SMTP hosts or credentials. The error is logged with Nest's `Logger` instead.

Before (v2):

```json
{ "mailer": { "status": "down", "transporters": "down", "error": "Invalid login: 535 Authentication failed" } }
```

After (v3):

```json
{ "mailer": { "status": "down", "transporters": "down" } }
```

If a dashboard or alert read the `error` field, read the application logs (`MailerHealthIndicator` context) instead.

## Security hardening

These are not API changes, but they can reject inputs that v2 accepted:

- **i18n locales are validated.** Locales that are not BCP 47-like tags (for example `../../uploads`) are ignored and the default locale is used, so a user-provided `locale` can't traverse paths.
- **`textTemplate` files must live inside `template.dir`.** Move text templates next to the HTML ones if they were elsewhere.
- **Stylesheets** are only read from `template.dir` or `cssBaseUrl` (see [above](#remote-stylesheets-are-not-fetched)).
- Template caches no longer inherit from `Object.prototype`.

### Peer dependency floors

The optional peers were raised to versions without known template-injection CVEs: `ejs >= 3.1.10` and `pug >= 3.0.3`. Upgrade them if your lockfile pins older versions:

```bash
pnpm add ejs@^3.1.10   # or pug@^3.0.3
```

## New in v3

- **NestJS 12 support.** Tested on NestJS 11 and 12; Nest types are imported from the `@nestjs/common` entry point, so the declarations resolve with `node16` and `bundler` module resolution. NestJS 12 needs Node.js >= 20.19 (or >= 22.12); to run Jest on it, use Node.js >= 24.9 with `NODE_OPTIONS=--experimental-vm-modules`.

## Next

- Read the [v3 docs](/v3/) if you stay on v3 for now.
- Continue with [Migrating to v4](./migration.md).
