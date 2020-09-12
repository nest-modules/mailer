---
id: mailer
title: How to use?
sidebar_label: How to use?
---

Check this documentation for how to use `@nestjs-modules/mailer`.

## Install

```sh
yarn add @nestjs-modules/mailer nodemailer
#or
npm install --save @nestjs-modules/mailer nodemailer
```

**Hint:** handlebars, pug and ejs is an optional dependency, if you want to use the template, you must install it.

#### with npm

```sh
npm install --save handlebars
#or
npm install --save pug
#or
npm install --save ejs
```

#### with yarn

```sh
yarn add handlebars
#or
yarn add pug
#or
yarn add ejs
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
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from: '"nest-modules" <modules@nestjs.com>',
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
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

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

<!--Ejs-->

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user@domain.com:pass@smtp.domain.com',
      defaults: {
        from: '"nest-modules" <modules@nestjs.com>',
      },
      template: {
        dir: __dirname + '/templates',
        adapter: new EjsAdapter(),
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
import { MailerModule } from '@nestjs-modules/mailer';
import { PugAdapter } from '@nestjs-modules/mailer/dist/adapters/pug.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: 'smtps://user@domain.com:pass@smtp.domain.com',
        defaults: {
          from: '"nest-modules" <modules@nestjs.com>',
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
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({
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
    }),
  ],
})
export class AppModule {}
```

<!--Handlebars with helpers-->

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import * as handlebars from 'handlebars';

const helpers = {
  handlebarsIntl: function(value) {
    let context = {
      value: value
    };

    var intlData = {
      locales: ['en-US'],
    };

    // use the formatNumber helper from handlebars-intl
    const template = handlebars.compile('{{formatNumber value}} is the final result!');

    const compiled = template(context, {
      data: {intl: intlData}
    });

    return compiled
  },
  otherHelper: function() {
    ...
  }
}

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
          adapter: new HandlebarsAdapter(helpers),
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
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
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
        },
      },
    }),
  ],
  controllers: [MailController],
  providers: [MailService, MailQueue],
  exports: [bullModule],
})
export class MailModule {}
```

### Control over inline-css in default adapters

It is possible to change `inline-css` options or even disable it in default adapters.
Just provide config object in constructor.

```typescript
new HandlebarsAdapter(/* helpers */ undefined, {
  inlineCssEnabled: true,
  /** See https://www.npmjs.com/package/inline-css#api */
  inlineCssOptions: {
    url: ' ',
    preserveMediaQueries: true,
  },
});

new PugAdapter({
  inlineCssEnabled: true,
  inlineCssOptions: { url: ' ' },
});

new EjsAdapter({
  inlineCssEnabled: false,
});
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
    this.mailerService
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
    this.mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailermodule with template ✔',
        template: 'welcome', // The `.pug`, `.ejs` or `.hbs` extension is appended automatically.
        context: {
          // Data to be sent to template engine.
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
    this.mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailermodule with template ✔',
        template: __dirname + '/welcome', // The `.pug`, `.ejs` or `.hbs` extension is appended automatically.
        context: {
          // Data to be sent to template engine.
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

## Preview Email

Use preview-email to open a preview of the email with the browser. This can be enabled or disabled.

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'localhost',
        port: 1025,
        ignoreTLS: true,
        secure: false,
        auth: {
          user: process.env.MAILDEV_INCOMING_USER,
          pass: process.env.MAILDEV_INCOMING_PASS,
        },
      },
      defaults: {
        from: '"No Reply" <no-reply@localhost>',
      },
      preview: true,
      template: {
        dir: process.cwd() + '/template/',
        adapter: new HandlebarsAdapter(), // or new PugAdapter() or new EjsAdapter()
        options: {
          strict: true,
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```
