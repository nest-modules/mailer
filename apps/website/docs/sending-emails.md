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

:::tip
When using absolute paths, make sure template files are copied to the `dist` folder at build time. See [Copy Templates to dist](/docs/configuration#copy-templates-to-dist).
:::

## Attachments

Send emails with file attachments:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      path: '/absolute/path/to/invoice.pdf',
    },
  ],
});
```

### Multiple Attachments

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Report',
  template: 'report',
  context: { title: 'Monthly Report' },
  attachments: [
    // File from disk
    { filename: 'report.pdf', path: '/path/to/report.pdf' },
    // Buffer
    { filename: 'data.csv', content: Buffer.from('id,name\n1,John') },
    // String content
    { filename: 'notes.txt', content: 'Some notes here' },
    // URL (nodemailer will fetch it)
    { filename: 'logo.png', path: 'https://example.com/logo.png' },
  ],
});
```

### Inline Images (Embedded)

Embed images directly in the HTML using `cid`:

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Newsletter',
  html: '<img src="cid:logo" alt="Logo" />',
  attachments: [
    {
      filename: 'logo.png',
      path: '/path/to/logo.png',
      cid: 'logo',
    },
  ],
});
```

See [Nodemailer attachments docs](https://nodemailer.com/message/attachments/) for all options.

## Custom Headers

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello!</p>',
  headers: {
    'X-Custom-Header': 'custom-value',
    'X-Priority': '1',
  },
});
```

## Reply-To and Threading

```typescript
await this.mailerService.sendMail({
  to: 'user@example.com',
  replyTo: 'support@example.com',
  subject: 'Re: Your ticket',
  html: '<p>We received your request.</p>',
  inReplyTo: '<original-message-id@example.com>',
  references: ['<original-message-id@example.com>'],
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

See [Multiple Transporters](/docs/configuration#multiple-transporters) for setup instructions.
