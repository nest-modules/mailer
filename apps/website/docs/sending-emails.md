---
sidebar_position: 4
title: Sending Emails
---

# Sending Emails

## Inject the Service

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationService {
  constructor(private readonly mailerService: MailerService) {}
}
```

`sendMail()` accepts the same fields as [nodemailer email message](https://nodemailer.com/message/).

## Plain Text / HTML

Send a simple email without templates:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  from: 'noreply@example.com',
  subject: 'Hello World',
  text: 'Plain text content',
  html: '<b>HTML content</b>',
});
```

## With Templates

Use your configured template engine. The file extension (`.hbs`, `.pug`, `.ejs`) is appended automatically:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Welcome!',
  template: 'welcome',       // resolves to templates/welcome.hbs
  context: {                  // data passed to the template
    name: 'John Doe',
    code: 'cf1a3f828287',
  },
});
```

## With Absolute Path

You can use an absolute path to the template file:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Welcome!',
  template: `${__dirname}/welcome`,
  context: {
    name: 'John Doe',
  },
});
```

## Using a Specific Transporter

When you have multiple transporters configured, specify which one to use:

```typescript
await this.mailerService.sendMail({
  transporterName: 'secondary',
  to: 'user@example.com',
  subject: 'Sent via secondary SMTP',
  html: '<p>Hello!</p>',
});
```
