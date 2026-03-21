---
sidebar_position: 3
title: Template Adapters
---

# Template Adapters

Each adapter wraps a template engine and provides a consistent interface for compiling email templates.

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
