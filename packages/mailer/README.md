<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
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

- **Built on Nodemailer** — Supports SMTP, SES, sendmail, and more.
- **Multiple Template Engines** — Handlebars, Pug, EJS, Liquid, or MJML.
- **NestJS Native** — Dependency injection, async configuration, and module patterns.
- **Multiple Transporters** — Configure multiple SMTP servers and switch per message.
- **CSS Inlining** — Built-in css-inline ensures emails render correctly across all clients.
- **Preview Emails** — Preview emails in the browser during development.

## Documentation

Full documentation is available at **[nest-modules.github.io/mailer](https://nest-modules.github.io/mailer/)**.

## Installation

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

Install a template engine of your choice:

```bash
pnpm add handlebars
# or
pnpm add pug
# or
pnpm add ejs
```

## Quick Start

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.example.com',
        port: 587,
        auth: {
          user: 'username',
          pass: 'password',
        },
      },
      defaults: {
        from: '"No Reply" <noreply@example.com>',
      },
      template: {
        adapter: new HandlebarsAdapter(),
      },
    }),
  ],
})
export class AppModule {}
```

```typescript
// example.service.ts
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class ExampleService {
  constructor(private readonly mailerService: MailerService) {}

  async sendEmail() {
    await this.mailerService.sendMail({
      to: 'user@example.com',
      subject: 'Hello',
      template: 'welcome',
      context: {
        name: 'John',
      },
    });
  }
}
```

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
