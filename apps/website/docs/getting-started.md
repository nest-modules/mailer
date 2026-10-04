---
sidebar_position: 1
title: Getting Started
---

# Getting Started

`@nestjs-modules/mailer` is a mailer module for the [NestJS](https://nestjs.com/) framework powered by [Nodemailer](https://nodemailer.com/).

## Requirements

- NestJS 7 – 12
- NestJS 12 is ESM-only and requires Node.js >= 20.19 (or >= 22.12); this CommonJS package loads it through Node.js' native `require(esm)`. To run Jest on a NestJS 12 project use Node.js >= 24.9 with `NODE_OPTIONS=--experimental-vm-modules`.

## Installation

Install the core package and nodemailer:

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

Install the TypeScript types for nodemailer:

```bash
pnpm add -D @types/nodemailer
```

### Template Engines (optional)

Template engines are optional peer dependencies and are **not** installed automatically. Install the engine(s) you plan to use:

```bash
# Handlebars
pnpm add handlebars

# Pug
pnpm add pug

# EJS
pnpm add ejs

# Liquid
pnpm add liquidjs

# MJML (responsive emails)
pnpm add mjml

# Nunjucks
pnpm add nunjucks

# Email previews in development (`preview` option)
pnpm add -D preview-email
```

## Basic Usage

Import `MailerModule` into your root `AppModule`:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'username',
          pass: 'password',
        },
      },
      defaults: {
        from: '"No Reply" <noreply@example.com>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class AppModule {}
```

Then inject and use `MailerService`:

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationService {
  constructor(private readonly mailerService: MailerService) {}

  async sendWelcomeEmail(email: string, name: string) {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Welcome!',
      template: 'welcome',
      context: { name },
    });
  }
}
```
