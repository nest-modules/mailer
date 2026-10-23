---
title: Mail classes
---

# Mail classes

A mail class is an injectable provider that turns typed data into an email. Instead of building `subject`, `template` and `context` in every service that sends a welcome email, you write a `WelcomeMail` class once and send it with `mailerService.send(WelcomeMail, { to, data })`. The data is type-checked, the class can inject other providers (an i18n service, a repository, configuration), and tests can assert on the class that was sent. New in v4; the shape is compatible with the mail classes of the official [`@nestjs/mail`](./nestjs-mail.md).

## Writing a mail class

Implement `Mailable<TData>`. `render()` receives the data and a context with the `locale` and the `to` recipients, and returns the content of the email:

```typescript
import { Injectable } from '@nestjs/common';
import { Mailable, MailableContext } from '@nestjs-modules/mailer';

export interface WelcomeData {
  name: string;
  verifyUrl: string;
}

@Injectable()
export class WelcomeMail implements Mailable<WelcomeData> {
  render(data: WelcomeData, { locale }: MailableContext) {
    return {
      subject: locale === 'es' ? `Bienvenido, ${data.name}` : `Welcome, ${data.name}`,
      template: 'welcome',
      context: data,
    };
  }
}
```

`render()` may be `async`. It can return any of these fields (`MailableContent`):

| Field | Description |
| --- | --- |
| `subject` | The subject line |
| `html` / `text` | An inline body (`html` may be a string or [`SafeHtml`](./sending-emails.md#safe-html-with-the-html-tag)) |
| `template` / `context` | A template rendered by the configured adapter, and its variables |
| `textTemplate` | A plain-text template for the text part |
| `attachments` | Attachments, as in `sendMail()` |
| `headers` | Extra headers |
| `from` / `replyTo` | Sender and reply address (otherwise `defaults` apply) |
| `transporterName` | A named transporter from `transports` |
| `icalEvent` | A calendar invitation |
| `unsubscribe` | [One-click unsubscribe](./delivery-rules.md#one-click-unsubscribe) headers |

`MailableContext` has two read-only fields: `locale` (the `locale` passed to `send()` or `render()`, if any) and `to`, the parsed recipients as `{ name?, address }` objects (empty when rendering a preview without recipients). Both have the same shape as `@nestjs/mail`'s `MailRenderContext`.

## Sending

```typescript
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { WelcomeMail } from './mail/welcome.mail';

@Injectable()
export class UsersService {
  constructor(private readonly mailerService: MailerService) {}

  async onSignup(user: { email: string; name: string; token: string }) {
    await this.mailerService.send(WelcomeMail, {
      to: user.email,
      data: { name: user.name, verifyUrl: `https://app.example.com/verify?token=${user.token}` },
      locale: 'es',
    });
  }
}
```

The second argument takes `data` plus every delivery option of `sendMail()` (`to`, `cc`, `bcc`, `locale`, `retry`, `idempotencyKey`, `signal`, `failover`, …), but not the content fields (`subject`, `html`, `text`, `template`, `context`, `textTemplate`), which come from the class. `data` is required when the class needs it and can be left out when it doesn't. When `render()` takes no data parameter, the options themselves are optional: `send(DailyReportMail)` compiles (the recipients then come from `defaults`).

Per-send options are merged over what `render()` returned:

- `from`, `replyTo`, `transporterName` (and any other delivery field you pass) **override** the rendered value;
- `attachments` are **appended** to the rendered ones;
- `headers` are **merged**, the per-send value winning for the same header name.

```typescript
await this.mailerService.send(InvoiceMail, {
  to: customer.email,
  data: invoice,
  from: 'billing@example.com',            // overrides render()'s from
  attachments: [{ filename: 'invoice.pdf', content: pdf }], // added
  headers: { 'X-Invoice-Id': invoice.id }, // merged
});
```

You can also pass an instance instead of the class (`send(new WelcomeMail(), { ... })`), and plain options still work: `send({ to, subject, template, context })` behaves like `sendMail()`.

## How the class is resolved

- If the class is **registered as a provider** in any module, that instance is used as is, so it can inject the providers of that module.
- Otherwise the mailer **creates it once** and caches it. Each constructor dependency, including tokens given with `@Inject()`, is looked up anywhere in the application. If one can't be found, the send fails with a `ReferenceError` that names the class, the missing dependency and its position.

Registering the class as a provider is still the most explicit option, and makes its dependencies part of that module's graph:

```typescript
import { Module } from '@nestjs/common';
import { OrdersRepository } from './orders.repository';
import { OrderShippedMail } from './mail/order-shipped.mail';

@Module({
  providers: [OrdersRepository, OrderShippedMail],
})
export class OrdersModule {}
```

## Rendering without sending

`mailerService.render()` returns the email as it would be sent, without sending it. Use it for previews, snapshot tests or to store a copy. It accepts the same arguments as `send()`; recipients are optional.

```typescript
const mail = await this.mailerService.render(WelcomeMail, {
  data: { name: 'Ada', verifyUrl: 'https://app.example.com/verify?token=t' },
  locale: 'en',
});

mail.subject; // 'Welcome, Ada'
mail.html;    // the rendered template
```

`render()` resolves to a `RenderedMail` with `subject`, `html`, `text`, `from`, `to`, `cc`, `bcc`, `replyTo`, `attachments` (always an array), `headers`, `template` and `locale`. Bodies that are not strings or buffers (a stream, a file path) come back as `undefined`. The [preview module](./preview.md) is built on it.

::: info
`render()` applies the content steps (subject interpolation, templates, i18n, the template resolver) but not the delivery rules: interception, suppression, unsubscribe headers and the idempotent `Message-ID` are only added when sending.
:::

## Testing a mail class

[`TestMailbox`](./testing.md) records which class rendered each email:

```typescript
mailbox.assertSent({ to: 'ada@example.com', mail: WelcomeMail });
```

## Coming from `@nestjs/mail`

Mail classes written for `@nestjs/mail` work with `MailerService.send()` unchanged, and type-check with both libraries: both call `render(data, { locale, to })` with the same context shape and accept `subject`, `html`/`text`, `template`/`context`, `attachments`, `headers`, `from` and `replyTo`. See [migrating mail classes](./nestjs-mail.md#migrating-mail-classes) for the differences.
