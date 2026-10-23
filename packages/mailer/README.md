<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  A mailer module for <a href="http://nestjs.com/">NestJS</a> using <a href="https://nodemailer.com/">Nodemailer</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nestjs-modules/mailer"><img src="https://img.shields.io/npm/v/@nestjs-modules/mailer.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/@nestjs-modules/mailer"><img src="https://img.shields.io/npm/l/@nestjs-modules/mailer.svg" alt="Package License" /></a>
  <a href="https://www.npmjs.com/package/@nestjs-modules/mailer"><img src="https://img.shields.io/npm/dm/@nestjs-modules/mailer.svg" alt="NPM Downloads" /></a>
</p>

## Features

Every capability is optional: pick what you need.

- **Write emails your way**: `sendMail()` with inline options, typed mail classes (`send(WelcomeMail, { to, data })`), or the official `@nestjs/mail` `Mailer` over our bridges.
- **Any transport**: SMTP and every nodemailer transport, or zero-dependency HTTP transports for Resend, Postmark, SendGrid, SES, Mailgun and Brevo.
- **Send when it suits you**: directly, in the background with BullMQ (with scheduling), or after your transaction commits through the official `@nestjs/outbox`.
- **Template engines**: Handlebars, Pug, EJS, Liquid, Nunjucks or MJML, with CSS inlining and i18n; or the escaping `html` tag. Plain-text parts are derived from the HTML.
- **Reliable delivery**: retries with backoff for transient failures, never at the risk of a duplicate; failover between transporters, `AbortSignal`, idempotency keys, graceful shutdown.
- **Typed errors and validation**: `MailerSmtpError`, `MailerTimeoutError`, `MailerProviderError`… with a `permanent` flag; malformed addresses and header injections rejected before sending.
- **Delivery rules**: redirect recipients in staging, suppression lists, one-click unsubscribe (RFC 8058).
- **Testing and development**: `TestMailbox` assertions, `FileTransport` / `LogTransport`, browser previews at `/_mailer`.
- **Operations**: events (RxJS, `@nestjs/event-emitter`, `diagnostics_channel`), batch sending, health checks.

## Documentation

Full documentation is available at **[nest-modules.github.io/mailer](https://nest-modules.github.io/mailer/)**:
[Getting started](https://nest-modules.github.io/mailer/guide/getting-started) ·
[Mail classes](https://nest-modules.github.io/mailer/guide/mailables) ·
[Reliability](https://nest-modules.github.io/mailer/guide/reliability) ·
[Delivery rules](https://nest-modules.github.io/mailer/guide/delivery-rules) ·
[HTTP transports](https://nest-modules.github.io/mailer/guide/http-transports) ·
[Transactional outbox](https://nest-modules.github.io/mailer/guide/outbox) ·
[Errors](https://nest-modules.github.io/mailer/guide/errors) ·
[Testing](https://nest-modules.github.io/mailer/guide/testing) ·
[Interop with @nestjs/mail](https://nest-modules.github.io/mailer/guide/nestjs-mail) ·
[Comparison](https://nest-modules.github.io/mailer/guide/comparison) ·
[Migrating to v4](https://nest-modules.github.io/mailer/guide/migration)

Older versions: [v3 docs](https://nest-modules.github.io/mailer/v3/) · [v2 docs](https://nest-modules.github.io/mailer/v2/) · [Versions & upgrading](https://nest-modules.github.io/mailer/guide/versions)

## Installation

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

Install a template engine of your choice (they are optional peer dependencies and are not installed automatically):

```bash
pnpm add handlebars
# or: pug, ejs, liquidjs, nunjucks, mjml
```

## Compatibility

| `@nestjs-modules/mailer` | NestJS | nodemailer | Node.js |
| --- | --- | --- | --- |
| 4.x | 11 – 12 | >= 8 | NestJS 12 requires Node.js >= 20.19 (or >= 22.12) |
| 2.x / 3.x | 7 – 12 | | |

NestJS 12 is published as ES modules. This package is CommonJS and loads it through Node.js' native `require(esm)` support, so no extra configuration is needed in your application. If you run Jest on a NestJS 12 project, use Node.js >= 24.9 with `NODE_OPTIONS=--experimental-vm-modules`.

Upgrading from v3? Retries, typed errors, validation and plain-text parts are now on by default; each can be turned off with one option (`retry: false`, `wrapErrors: false`, `validate: false`, `textFromHtml: false`). See the [migration guide](https://nest-modules.github.io/mailer/guide/migration).

## Quick Start

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'node:path';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'username', pass: 'password' },
      },
      defaults: { from: '"No Reply" <noreply@example.com>' },
      template: {
        dir: join(__dirname, 'templates'),
        adapter: new HandlebarsAdapter(),
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
// welcome.mail.ts
import { Injectable } from '@nestjs/common';
import { Mailable } from '@nestjs-modules/mailer';

@Injectable()
export class WelcomeMail implements Mailable<{ name: string }> {
  render({ name }: { name: string }) {
    return { subject: `Welcome, ${name}!`, template: 'welcome', context: { name } };
  }
}
```

```typescript
// users.service.ts
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { WelcomeMail } from './welcome.mail';

@Injectable()
export class UsersService {
  constructor(private readonly mailerService: MailerService) {}

  async welcome(email: string, name: string) {
    await this.mailerService.send(WelcomeMail, { to: email, data: { name } });

    // Or without a mail class
    await this.mailerService.sendMail({
      to: email,
      subject: 'Hello',
      template: 'welcome',
      context: { name },
    });
  }
}
```

Prefer an HTTP API over SMTP? Swap the transport, nothing else changes:

```typescript
import { ResendTransport } from '@nestjs-modules/mailer';

MailerModule.forRoot({
  transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY! }),
  defaults: { from: 'App <app@example.com>' },
});
```

## With `@nestjs/mail`

Use the official [`@nestjs/mail`](https://trilon.io/blog/sending-email-with-nestjs-mail) API with any nodemailer transport, this module's templates, or `MailerService` delivery (failover, interception, suppression):

```typescript
import { Module } from '@nestjs/common';
import { MailModule } from '@nestjs/mail';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { NodemailerMailTransport, TemplateAdapterEngine } from '@nestjs-modules/mailer/nestjs-mail';
import { join } from 'node:path';

@Module({
  imports: [
    MailModule.forRoot({
      transport: new NodemailerMailTransport({ host: 'smtp.example.com', port: 587 }),
      templates: new TemplateAdapterEngine({
        adapter: new HandlebarsAdapter(),
        dir: join(__dirname, 'templates'),
      }),
      from: 'App <app@example.com>',
    }),
  ],
})
export class AppModule {}
```

See [Interop with @nestjs/mail](https://nest-modules.github.io/mailer/guide/nestjs-mail) for `MailerServiceTransport` and an [honest comparison](https://nest-modules.github.io/mailer/guide/comparison) of both packages.

## Contributing

Contributions are welcome! See the [documentation](https://nest-modules.github.io/mailer/) for details on the monorepo structure and development commands.

### Contributors

- [Cristiam Diaz](https://github.com/cdiaz)
- [Eduardo Leal](https://github.com/eduardoleal)
- [Juan Echeverry](https://github.com/juandav)
- [Pat McGowan](https://github.com/p-mcgowan)
- [Paweł Partyka](https://github.com/partyka95)
- [Wasutan Kitijerapat](https://github.com/kitimark)
- [Alexandre Titeux](https://github.com/GFoniX)

## License

MIT
