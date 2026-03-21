---
sidebar_position: 1
title: Getting Started
---

# Getting Started

`@nestjs-modules/mailer` is a mailer module for the [NestJS](https://nestjs.com/) framework powered by [Nodemailer](https://nodemailer.com/).

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

Install the template engine(s) you plan to use:

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
