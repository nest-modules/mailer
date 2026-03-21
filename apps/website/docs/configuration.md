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

## OAuth2 Authentication

Use Gmail or other providers with OAuth2:

```typescript
MailerModule.forRoot({
  transport: {
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: 'your-email@gmail.com',
      clientId: 'CLIENT_ID',
      clientSecret: 'CLIENT_SECRET',
      refreshToken: 'REFRESH_TOKEN',
    },
  },
  defaults: {
    from: '"App Name" <your-email@gmail.com>',
  },
})
```

See [Nodemailer OAuth2 docs](https://nodemailer.com/smtp/oauth2/) for details on setting up OAuth2 credentials.

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

Configure multiple SMTP servers with different credentials and switch between them per message:

```typescript
MailerModule.forRoot({
  transports: {
    primary: {
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'primary@example.com', pass: 'pass1' },
    },
    secondary: {
      host: 'smtp.other.com',
      port: 587,
      auth: { user: 'secondary@other.com', pass: 'pass2' },
    },
    ses: {
      SES: { /* AWS SES config */ },
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

All transport types are supported for additional transporters: SMTP, SES, Sendmail, Stream, JSON, and custom transports.

## Dynamic Transporters

Add transporters at runtime using `addTransporter()`:

```typescript
this.mailerService.addTransporter('custom', {
  host: 'smtp.custom.com',
  port: 587,
  auth: { user: 'user', pass: 'pass' },
});

// Use immediately
await this.mailerService.sendMail({
  transporterName: 'custom',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello!</p>',
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

This checks SMTP connectivity when the module initializes. If verification fails, a warning is logged but the application continues to start.

Or verify programmatically:

```typescript
const allReady = await this.mailerService.verifyAllTransporters();
```

## Preview Emails

Use `preview-email` to open a preview in the browser during development:

```bash
pnpm add preview-email
```

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

:::note
- `preview-email` is an **optional** dependency. Install it only if you use this feature.
- Preview does **not** prevent the email from being sent — it runs alongside sending.
- Preview may not work in headless environments (Docker, CI servers).
- You can pass options: `preview: { open: { wait: false } }`.
:::

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

:::warning
Templates are **not** compiled by TypeScript. If you reference templates with `__dirname`, make sure they exist in the `dist` folder at runtime.
:::
