<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  Demo implementation on the mailer modules for Nest framework (node.js) using <a href="https://nodemailer.com/">Nodemailer</a> library
</p>

## Nestjs-mailer starter kit / project for your NestJs project.

### Goals

The main goal of this kit is to <strong>quickly get you started on your project</strong> with <a href="https://github.com/nest-modules/mailer/" target="_blank">Nestjs Mailer</a>, bringing a <strong>solid layout foundation</strong> to work upon.

### Usage

Import the MailerModule into the root AppModule

Synchronous import

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.example.com',
        port: 587,
        secure: false // upgrade later with STARTTLS
        auth: {
          user: "username",
          pass: "password",
        },
      },
      defaults: {
        from:'"nest-modules" <modules@nestjs.com>',
      },
      template: {
        dir: process.cwd() + '/templates/',
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

Asynchronous import

```typescript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
        host: 'smtp.example.com',
        port: 587,
        secure: false // upgrade later with STARTTLS
        auth: {
          user: "username",
          pass: "password",
        },
        defaults: {
          from:'"nest-modules" <modules@nestjs.com>',
        },
        template: {
          dir: process.cwd() + '/templates/',
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

After this, MailerService will be available to inject across entire project, for example in this way : 

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class ExampleService {
  constructor(private readonly mailerService: MailerService) {}
}
```

MailerProvider exports the `sendMail()` function to which you can pass the message options (sender, email subject, recipient, body content, etc)

`sendMail()` accepts the same fields as [nodemailer email message](https://nodemailer.com/message/)

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

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
      .then((success) => {
        console.log(success)
      })
      .catch((err) => {
        console.log(err)
      });
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
       .then((success) => {
        console.log(success)
      })
      .catch((err) => {
        console.log(err)
      });
  }
  
  public example3(): void {
    this
      .mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailermodule with template ✔',
        template: '/welcome', // The `.pug` or `.hbs` extension is appended automatically.
        context: {  // Data to be sent to template engine.
          code: 'cf1a3f828287',
          username: 'john doe',
        },
      })
      .then((success) => {
        console.log(success)
      })
      .catch((err) => {
        console.log(err)
      });
  }
}
```

Make a template named folder at the root level of the project and keep all the email-templates in the that folder with `.hbs` extension.
This implementation uses handlebars as a view-engine and outlook as the smtp.


### Configuration

Dotenv module is been used for sender's email and password keep. This kit is implemented with outlook smtp, while we can makes changes in the `app.module.ts` configurations for other services. As the nestjs-mailer is built on top of nodemailer, the required configurations can be found here <a href="https://nodemailer.com/smtp/">Nodemailer / smtp</a>. 

*Special thanks to https://github.com/leemunroe/responsive-html-email-template for providing email-templates*

