---
sidebar_position: 3
title: Template Adapters
---

# Template Adapters

Each adapter wraps a template engine and provides a consistent interface for compiling email templates.

:::info Import paths
Adapters are imported from `@nestjs-modules/mailer/adapters/<name>.adapter`. The legacy `@nestjs-modules/mailer/dist/adapters/<name>.adapter` paths used by 2.0.x remain supported for backwards compatibility.
:::

## Handlebars

```typescript
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

MailerModule.forRoot({
  // ...
  template: {
    dir: __dirname + '/templates',
    adapter: new HandlebarsAdapter(),
    options: { strict: true },
  },
})
```

### Custom Helpers

Pass a helpers object to the adapter:

```typescript
const helpers = {
  uppercase: (value: string) => value.toUpperCase(),
  formatDate: (date: Date) => date.toLocaleDateString(),
};

new HandlebarsAdapter(helpers);
```

### Partials

Enable Handlebars partials for reusable template fragments:

```typescript
import * as path from 'node:path';

MailerModule.forRoot({
  // ...
  template: {
    dir: path.join(process.env.PWD, 'templates/pages'),
    adapter: new HandlebarsAdapter(),
    options: { strict: true },
  },
  options: {
    partials: {
      dir: path.join(process.env.PWD, 'templates/partials'),
      options: { strict: true },
    },
  },
})
```

## Pug

```typescript
import { PugAdapter } from '@nestjs-modules/mailer/adapters/pug.adapter';

MailerModule.forRoot({
  // ...
  template: {
    dir: __dirname + '/templates',
    adapter: new PugAdapter(),
    options: { strict: true },
  },
})
```

`template.options` are passed to pug's compiler (for example `basedir`, `pretty` or `filters`) and are also available as template variables. Since 3.0, the `context` only provides template variables and can no longer change compiler options.

## EJS

```typescript
import { EjsAdapter } from '@nestjs-modules/mailer/adapters/ejs.adapter';

MailerModule.forRoot({
  // ...
  template: {
    dir: __dirname + '/templates',
    adapter: new EjsAdapter(),
    options: { strict: true },
  },
})
```

## Liquid

```typescript
import { LiquidAdapter } from '@nestjs-modules/mailer/adapters/liquid.adapter';

MailerModule.forRoot({
  // ...
  template: {
    dir: __dirname + '/templates',
    adapter: new LiquidAdapter(),
  },
})
```

## MJML

[MJML](https://mjml.io/) creates responsive emails. The `MjmlAdapter` wraps another template adapter (Pug, Handlebars, or EJS) to compile your template first, then convert the output through MJML into responsive HTML.

**Important:** Set `inlineCssEnabled: false` because MJML handles its own CSS inlining.

```typescript
import { MjmlAdapter } from '@nestjs-modules/mailer/adapters/mjml.adapter';

// With Handlebars
new MjmlAdapter('handlebars', { inlineCssEnabled: false })

// With Pug
new MjmlAdapter('pug', { inlineCssEnabled: false })

// With EJS
new MjmlAdapter('ejs', { inlineCssEnabled: false })
```

You can also pass Handlebars helpers via the third parameter:

```typescript
new MjmlAdapter(
  'handlebars',
  { inlineCssEnabled: false },
  { handlebar: { helper: myHelpers } },
)
```

## CSS Inlining

All default adapters support built-in CSS inlining via `css-inline`. Control it through the adapter config:

```typescript
// Enable with custom options
new HandlebarsAdapter(undefined, {
  inlineCssEnabled: true,
  inlineCssOptions: {
    // See: https://www.npmjs.com/package/@css-inline/css-inline#configuration
  },
});

// Disable CSS inlining
new EjsAdapter({
  inlineCssEnabled: false,
});

new PugAdapter({
  inlineCssEnabled: true,
  inlineCssOptions: {},
});
```

### Remote Stylesheets

Since 3.0, CSS inlining never fetches stylesheets: `loadRemoteStylesheets` defaults to `false`, even when you pass your own `inlineCssOptions`. Local `<link rel="stylesheet">` tags are resolved by the Handlebars and EJS adapters, and only `.css` files inside the template directory (or `cssBaseUrl`) are read. Any other `<link>` is dropped.

Opt back in only if your templates never contain URLs that come from user data:

```typescript
new HandlebarsAdapter(undefined, {
  inlineCssOptions: { loadRemoteStylesheets: true },
});
```

