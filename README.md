<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  A mailer module for Nest framework (node.js) using <a href="https://nodemailer.com/">Nodemailer</a> library
</p>

<p align="center">
  <a href="https://www.npmjs.com/~nest-modules"><img src="https://img.shields.io/npm/v/@nest-modules/mailer.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/~nest-modules"><img src="https://img.shields.io/npm/l/@nest-modules/mailer.svg" alt="Package License" /></a>
  <a href="https://www.npmjs.com/~nest-modules"><img src="https://img.shields.io/npm/dm/@nest-modules/mailer.svg" alt="NPM Downloads" /></a>
</p>

### Installation

```
npm install --save @nest-modules/mailer
```

### Usage

Import the MailerModule into the root AppModule.

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nest-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from:'"nest-modules" <modules@nestjs.com>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new HandlebarsAdapter(), // or new PugAdapter()
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class AppModule {}
```

Of course, it is possible to use an async configuration:

```typescript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nest-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: 'smtps://user@domain.com:pass@smtp.domain.com',
        defaults: {
          from:'"nest-modules" <modules@nestjs.com>',
        },
        template: {
          dir: __dirname + '/templates',
          adapter: new HandlebarsAdapter(), // or new PugAdapter()
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

Afterwards, MailerService will be available to inject across entire project (without importing any module elsewhere), for example in this way:

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nest-modules/mailer';

@Injectable()
export class ExampleService {
  constructor(private readonly mailerService: MailerService) {}
}
```

MailerProvider exports the `sendMail()` function to which you can pass the message options (sender, email subject, recipient, body content, etc)

`sendMail()` accepts the same fields as [nodemailer email message](https://nodemailer.com/message/)

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nest-modules/mailer';

@Injectable()
export class ExampleService {
  constructor(private readonly mailerService: MailerService) {}
  
  public example(): void {
    this
      .mailerService
      .sendMail({
        to: 'test@nestjs.com', // list of receivers
        from: 'noreply@nestjs.com', // sender address
        subject: 'Testing Nest MailerModule ✔', // Subject line
        text: 'welcome', // plaintext body
        html: '<b>welcome</b>', // HTML body content
      })
      .then(() => {})
      .catch(() => {});
  }
  
  public example2(): void {
    this
      .mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailermodule with template ✔',
        template: 'welcome', // The `.pug` or `.hbs` extension is appended automatically.
        context: {  // Data to be sent to template engine.
          code: 'cf1a3f828287',
          username: 'john doe',
        },
      })
      .then(() => {})
      .catch(() => {});
  }
  
  public example3(): void {
    this
      .mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailermodule with template ✔',
        template: __dirname + '/welcome', // The `.pug` or `.hbs` extension is appended automatically.
        context: {  // Data to be sent to template engine.
          code: 'cf1a3f828287',
          username: 'john doe',
        },
      })
      .then(() => {})
      .catch(() => {});
  }
}
```

### Contributing

* [Paweł Partyka](https://github.com/partyka95)
* [Cristiam Diaz](https://github.com/cdiaz)
* [Pat McGowan](https://github.com/p-mcgowan)

### License

MIT
