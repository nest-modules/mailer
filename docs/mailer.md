---
id: mailer
title: How to use?
sidebar_label: How to use?
---

Check this documentation for how to use ```@nestjs/mailer```.

## Install

```sh
yarn add @nestjs/mailer
#or
npm install --save @nestjs/mailer
```

## Module

You can create a module with mailer as follows

### Configuration

Import the MailerModule into the root AppModule.

<!--DOCUSAURUS_CODE_TABS-->
<!--Pug-->

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { PugAdapter, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from:'"nest-modules" <modules@nestjs.com>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new PugAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
})
export class AppModule {}
```
<!--Handlebars-->
```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from:'"nest-modules" <modules@nestjs.com>',
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

<!--END_DOCUSAURUS_CODE_TABS-->

### Async configuration

Of course, it is possible to use an async configuration:

<!--DOCUSAURUS_CODE_TABS-->

<!--Pug-->
```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { PugAdapter, MailerModule } from '@nestjs-modules/mailer';

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
          adapter: new PugAdapter(),
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
<!--Handlebars-->
```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { HandlebarsAdapter, MailerModule } from '@nestjs-modules/mailer';

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
          adapter: new HandlebarsAdapter(),
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

<!--END_DOCUSAURUS_CODE_TABS-->

### Enable handlebars partials

```typescript
import * as path from 'path';
import { Module } from '@nestjs/common';
import { BullModule } from 'nest-bull';
import { MailerModule, HandlebarsAdapter } from '@nestjs-modules/mailer';
import { mailBullConfig } from '../../config/mail';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';
import { MailQueue } from './mail.queue';

const bullModule = BullModule.forRoot(mailBullConfig);
@Module({
  imports: [
    bullModule,
    MailerModule.forRoot({
      defaults: {
        from: '"No Reply" <noreply@example.com>',
      },
      template: {
        dir: path.join(process.env.PWD, 'templates/pages'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
      options: {
        partials: {
          dir: path.join(process.env.PWD, 'templates/partials'),
          options: {
            strict: true,
          },
        }
      }
    }),
  ],
  controllers: [MailController],
  providers: [MailService, MailQueue],
  exports: [bullModule],
})
export class MailModule {}
```

## Service

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

<!--DOCUSAURUS_CODE_TABS-->
<!--Example 1-->
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
      .then(() => {})
      .catch(() => {});
  }
  
}
```

<!--Example 2-->
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
    
}
```

<!--Example 3-->
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

<!--END_DOCUSAURUS_CODE_TABS-->

