<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  Demo implementation on the mailer modules for Nest framework (node.js) using <a href="https://nodemailer.com/">Nodemailer</a> library
</p>

## Nestjs-mailer with custom template adapter

### Goals

The main goal of this project is to be an example of how-to implement your custom adapter for any template engine aside from the officially provided.

### Usage

Create your custom adapter class and be sure to implements `TemplateAdapter` interface.

```typescript
// adapters/twing.adapter.ts
import { MailerOptions, TemplateAdapter } from '@nestjs-modules/mailer';
import * as inlineCSS from 'inline-css';
import * as path from 'path';
import { TwingEnvironment, TwingLoaderFilesystem, TwingTemplate } from 'twing';

export class TwingAdapter implements TemplateAdapter {
  private precompiledTemplates: Map<string, TwingTemplate> = new Map();

  compile(
    mail: any,
    callback: (err?: any, body?: string) => any,
    options: MailerOptions,
  ): void {
    const templateExt = path.extname(mail.data.template) || '.twig';
    const templateName = path.basename(mail.data.template, templateExt);
    const templateDir =
      options.template?.dir ?? path.dirname(mail.data.template);
    const loader = new TwingLoaderFilesystem(templateDir);
    const twing = new TwingEnvironment(loader);

    this.renderTemplate(twing, templateName + templateExt, mail.data.context)
      .then((html) => {
        mail.data.html = html;

        return callback();
      })
      .catch(callback);
  }

  private async renderTemplate(
    twing: TwingEnvironment,
    template: string,
    context: Record<string, any>,
  ): Promise<string> {
    if (!this.precompiledTemplates.has(template))
      this.precompiledTemplates.set(template, await twing.load(template));

    const rendered = await this.precompiledTemplates
      .get(template)
      .render(context);

    return inlineCSS(rendered, { url: ' ' });
  }
}
```


Import the MailerModule into the root AppModule

Synchronous import

```typescript
//app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { TwingAdapter } from './adapters/twing.adapter';

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
        dir: `${process.cwd()}/templates/`,
        adapter: new TwingAdapter(),
      },
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

  example() {
    return this
      .mailerService
      .sendMail({
        to: 'test@nestjs.com',
        from: 'noreply@nestjs.com',
        subject: 'Testing Nest Mailer module with template ✔',
        template: 'index', // The `.twig` extension is appended automatically.
        context: {  // Data to be sent to template engine.
          code: 'cf1a3f828287',
          username: 'john doe',
        },
      });
  }
}
```

Make a `templates` named folder at the root level of the project and keep all the email-templates in the that folder with `.twig` extension.
This implementation uses [Twing](https://nightlycommit.github.io/twing/) as a view-engine and smtp transporter.


### Configuration

Docker Compose is used to run MailDev as SMTP server for development purpose, so be sure to have Docker installed; then just run ``docker-compose up -d`` before start nest.js

*Special thanks to https://github.com/leemunroe/responsive-html-email-template for providing email-templates*

