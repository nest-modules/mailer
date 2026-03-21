---
title: "Choosing the Right Template Engine for Your Emails"
authors:
  - name: Juan David
tags: [nestjs, templates, handlebars, pug, ejs, mjml]
---

Picking the right template engine can make or break your email development workflow. Here's a practical comparison of the engines supported by `@nestjs-modules/mailer`.

<!-- truncate -->

## Handlebars

The most popular choice. Handlebars keeps logic out of templates and is easy to learn.

```bash
pnpm add @nestjs-modules/mailer-handlebars-adapter handlebars
```

```typescript
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

MailerModule.forRoot({
  template: {
    dir: join(__dirname, 'templates'),
    adapter: new HandlebarsAdapter(),
    options: { strict: true },
  },
});
```

**Best for:** Most projects. Simple syntax, great community support, and partials/layouts work well for email structures.

## Pug

Pug's indentation-based syntax produces clean, readable templates with less markup.

```bash
pnpm add @nestjs-modules/mailer-pug-adapter pug
```

```typescript
import { PugAdapter } from '@nestjs-modules/mailer/adapters/pug.adapter';

MailerModule.forRoot({
  template: {
    dir: join(__dirname, 'templates'),
    adapter: new PugAdapter(),
  },
});
```

**Best for:** Teams that prefer concise markup and are already familiar with Pug from web projects.

## EJS

EJS uses plain JavaScript inside templates, giving you full control without learning a new syntax.

```bash
pnpm add @nestjs-modules/mailer-ejs-adapter ejs
```

```typescript
import { EjsAdapter } from '@nestjs-modules/mailer/adapters/ejs.adapter';

MailerModule.forRoot({
  template: {
    dir: join(__dirname, 'templates'),
    adapter: new EjsAdapter(),
  },
});
```

**Best for:** Developers who want to use plain JavaScript expressions in templates without learning a DSL.

## MJML

MJML is purpose-built for responsive emails. It compiles to battle-tested HTML that works across all email clients.

```bash
pnpm add mjml
```

**Best for:** Production email systems where cross-client rendering is critical. MJML handles the responsive email quirks so you don't have to.

## Quick Comparison

| Engine      | Syntax      | Learning Curve | Responsive Emails | Use Case              |
|------------|-------------|----------------|--------------------|-----------------------|
| Handlebars | Mustache    | Low            | Manual             | General purpose       |
| Pug        | Indentation | Medium         | Manual             | Clean markup          |
| EJS        | JS inline   | Low            | Manual             | JS-native templates   |
| MJML       | XML tags    | Medium         | Built-in           | Production emails     |

## Recommendation

Start with **Handlebars** if you're unsure. It covers most use cases, has the most examples in the community, and integrates cleanly with layouts and partials.

If you're building marketing or transactional emails that must look perfect across Gmail, Outlook, and Apple Mail, consider adding **MJML**.

Check the [Adapters](/docs/adapters) docs for detailed setup instructions.
