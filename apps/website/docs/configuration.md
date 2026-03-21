---
sidebar_position: 2
title: Configuration
---

# Configuration

## Synchronous Configuration

Import `MailerModule.forRoot()` with your transport and template settings:

```typescript
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from: '"nest-modules" <modules@nestjs.com>',
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

You can also pass a transport configuration object instead of a connection string:

```typescript
MailerModule.forRoot({
  transport: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'user@example.com',
      pass: 'password',
    },
  },
  // ...
})
```

## Async Configuration

Use `forRootAsync()` to load config from environment or external services:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: config.get('MAIL_PORT'),
          auth: {
            user: config.get('MAIL_USER'),
            pass: config.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('MAIL_FROM'),
        },
        template: {
          dir: __dirname + '/templates',
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

## Multiple Transporters

Configure multiple SMTP servers and switch between them per message:

```typescript
MailerModule.forRoot({
  transports: {
    primary: 'smtps://user@domain.com:pass@smtp.domain.com',
    secondary: {
      host: 'smtp.other.com',
      port: 587,
      auth: { user: 'user', pass: 'pass' },
    },
  },
  defaults: {
    from: '"No Reply" <noreply@example.com>',
  },
  template: {
    dir: __dirname + '/templates',
    adapter: new HandlebarsAdapter(),
  },
})
```

Then specify which transporter to use when sending:

```typescript
await this.mailerService.sendMail({
  transporterName: 'secondary',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<b>Hello</b>',
});
```

## Dynamic Transporters

Add transporters at runtime using `addTransporter()`:

```typescript
this.mailerService.addTransporter('custom', {
  host: 'smtp.custom.com',
  port: 587,
  auth: { user: 'user', pass: 'pass' },
});
```

## Verify Transporters

Enable automatic transporter verification on startup:

```typescript
MailerModule.forRoot({
  transport: 'smtps://user@domain.com:pass@smtp.domain.com',
  verifyTransporters: true,
})
```

Or verify programmatically:

```typescript
const allReady = await this.mailerService.verifyAllTransporters();
```

## Preview Emails

Use `preview-email` to open a preview in the browser during development:

```typescript
MailerModule.forRoot({
  transport: {
    host: 'localhost',
    port: 1025,
    ignoreTLS: true,
    secure: false,
  },
  defaults: {
    from: '"No Reply" <no-reply@localhost>',
  },
  preview: true,
  template: {
    dir: __dirname + '/templates',
    adapter: new HandlebarsAdapter(),
  },
})
```

## Copy Templates to `dist`

If your templates are inside `src/`, add them as assets in `nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "assets": ["**/*.hbs"]
  }
}
```

Use the appropriate extension (`.hbs`, `.pug`, `.ejs`) for your template engine.
