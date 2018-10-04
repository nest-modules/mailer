## Nest mailer module

A mailer module for Nest framework (node.js)

Nest MailerModule provide a wrapper around [nodemailer](https://nodemailer.com/) used for send email with support for [PugJS](https://pugjs.org) template files.

### Installation

```
npm install --save @nest-modules/mailer
```

### Usage

Import the MailerModule into the root ApplicationModule.

```javascript
//app.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nest-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: 'smtps://user%40gmail.com:pass@smtp.gmail.com',
      defaults: {
        from:'"nest-modules" <modules@nestjs.com>',
      },
      templateDir: './src/common/email-templates'
      templateOptions: {
        engine: 'PUG'
      }
    }),
  ],
})
export class ApplicationModule {}
```

The `forRoot()` method accepts a configuration JSON object with the following attributes:

**transport** is the transport configuration object, connection url or a transport plugin instance

**defaults** is an optional object of message data fields that are set for every message sent

**templateDir** is the path to directory where you have put your templates; the default value is `/public/templates` if not specified.

**templateOptions.engine** is the template engine used for rendering html. Accepts PUG (default) or HANDLEBARS (case-insensitive).

**templateOptions.precompiledTemplates** is a hash of `templateName: (context) => htmlString`. Currently only used in `handlebars` engine, to optimize dynamic rendering.

**templateOptions.engineAdapter** is a custom templating function. The function signature is `(templateDir: string, mail: any, callback: (err?: any, data?: string) => any)`.

>For more details about transporters and defaults values please visit: [nodemailer](https://nodemailer.com/)


Futhermore, instead of passing anything to the `forRoot()`, we can create an `mailerconfig.ts` file in the project root directory.

```javascript
//mailerconfig.ts
export = {
  transport: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'username',
      pass: 'password'
    }
  },
  defaults: {
    forceEmbeddedImages: true,
    from:'"nest-modules" <modules@nestjs.com>',
  },
  templateDir: './src/common/email-templates'
}
```

Now we can simply leave the parenthesis empty:

```javascript
//app.module.ts
app.module.ts JavaScript TypeScript

import { Module } from '@nestjs/common';
import { MailerModule } from '@nest-modules/mailer';

@Module({
  imports: [MailerModule.forRoot()],
})
export class ApplicationModule {}
```


Afterwards, MailerProvider will be available to inject across entire project (without importing any module elsewhere), for example in this way:

```javascript
@Inject('MailerProvider') private readonly mailerProvider
```

#### Sending messages:

MailerProvider exports the `sendMail()` function to which you can pass the message options (sender, email subject, recipient, body content, etc)

`sendMail()` acept the same fields of an [nodemailer email message](https://nodemailer.com/message/)

ex:

```javascript
this.mailerProvider.sendMail({
  to: 'test@nestjs.com', // sender address
  from: 'noreply@nestjs.com', // list of receivers
  subject: 'Testing Nest MailerModule ✔', // Subject line
  text: 'welcome', // plaintext body
  html: '<b>welcome</b>' // HTML body content
})
```

This method returns a Promise object

#### Templating:
MailerModule renders pug/handlebars templates using the data specified in the context message object

ex:

```javascript
this.mailerProvider.sendMail({
  to: 'test@nestjs.com',
  from: 'noreply@nestjs.com',
  subject: 'Testing Nest Mailermodule with template ✔',
  template: 'welcome', // The `.pug` extension is appended automatically.
  context: {  // Data to be sent to PugJS template files.
    username: 'john doe',
    code: 'cf1a3f828287'
  }
})
```
where:

**template** is a name from template file (without extension)

**context** is an object with dynamic content which will be bing to templates

##### Pug engine:

Create a pug template in your templateDir, on this case:

`<templateDir>/welcome.pug`

Put this code in your template:
```jade
p Welcome #{username}, your activation code is #{code}
```

Pug will compile the template to html code and return the body of message

The result is:
```html
<p>Welcome john doe, your activation code is cf1a3f828287</p>
```

##### Handlebars engine:

Or for handlebars create a template

`<templateDir>/welcome.hbs`

With the following content
```
<h1>Welcome {{username}}!</h1>
<p>your activation code is {{code}}</p>
```

and set the `templateOptions.engine` parameter to `handlebars` (case-insensitive):

```javascript
//mailerconfig.ts
export = {
  transport: 'smtps://user%40gmail.com:pass@smtp.gmail.com',
  defaults: {
    forceEmbeddedImages: true,
    from:'"nest-modules" <modules@nestjs.com>',
  },
  templateDir: './src/common/email-templates',
  templateOptions: {
    engine: 'handlebars'
  }
}
```

You can also supply precompiled templates, for instance in handlebars:

```javascript
//mailerconfig.ts
export = {
  transport: 'smtps://user%40gmail.com:pass@smtp.gmail.com',
  defaults: {
    forceEmbeddedImages: true,
    from: '"nest-modules" <modules@nestjs.com>',
  },
  templateDir: './src/common/email-templates',
  templateOptions: {
    precompiledTemplates: {
      test_1: Handlebars.compile(test_1_string),
      test_2: Handlebars.compile(test_2_string)
    },
    engine: 'handlebars',
  },
};
```

##### Custom template Adaptor

Pug and Handlebars are natively supported (via the `templateOptions.engine` option), but you can pass in a custom template adaptor function (such as EJS) to the `templateOptions.adaptor` config:

```javascript
//mailerconfig.ts

const customAdaptor = (templateDir, mail, callback) => {
  const templatePath = path.join(process.cwd(), templateDir, mail.data.template) + '.html';

  try {
    const templateString = fs.readFileSync(templatePath, 'UTF-8');
    mail.data.html = templateString.replace(/javascript/g, 'typescript');

    return callback();
  } catch (err) {
    return callback(err);
  }
}

export = {
  transport: 'smtps://user%40gmail.com:pass@smtp.gmail.com',
  defaults: {
    forceEmbeddedImages: true,
    from:'"nest-modules" <modules@nestjs.com>',
  },
  templateDir: './src/common/email-templates',
  templateOptions: {
    engineAdapter: customAdaptor
  }
}
```

#### Using a transport plugin instance:

In some cases you will want to use a nodemailer transport plugin, such as mandrill, sendgrid, mailgun, etc.

You must only create the instance and send it to the transport value.

ex:
```
npm install --save nodemailer-mandrill-transport
```

```javascript
//mailerconfig.ts
import * as mandrillTransport from 'nodemailer-mandrill-transport'

export = {
  transport: mandrillTransport({
    auth: {
      api_key: 'key'
    }
  }),
  defaults: {
    from:'"nest-mailer" <noreply@nestjs.com>',
  },
  templateDir: './src/common/email-templates'
}
```

### Contributing

* [Paweł Partyka](http://epartyka.com)
* [Cristiam Diaz](https://github.com/cdiaz)
* [Pat McGowan](https://github.com/p-mcgowan)

### License

MIT