---
title: Testing
---

# Testing

Mocking `MailerService` tells you a method was called, not what the user would receive. `MailerTestModule` runs the real mailer (templates, i18n, mail classes, delivery rules) on a transport that sends nothing, and gives you a `TestMailbox` with every email captured after rendering, plus assertions to check recipients, subjects, links and attachments. New in v4.

## Setup

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MailerTestModule, TestMailbox } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'node:path';
import { UsersService } from './users.service';
import { WelcomeMail } from './mail/welcome.mail';

describe('UsersService', () => {
  let moduleRef: TestingModule;
  let mailbox: TestMailbox;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MailerTestModule.register({
          defaults: { from: 'App <app@example.com>' },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
          },
        }),
      ],
      providers: [UsersService],
    }).compile();

    mailbox = moduleRef.get(TestMailbox);
  });

  afterEach(() => moduleRef.close());

  it('sends a welcome email with a verification link', async () => {
    await moduleRef.get(UsersService).onSignup({ email: 'ada@example.com', name: 'Ada', token: 'abc' });

    const mail = mailbox.assertSent({ to: 'ada@example.com', mail: WelcomeMail });
    expect(mail.subject).toBe('Welcome, Ada');
    expect(mail.link('/verify').searchParams.get('token')).toBe('abc');
  });
});
```

`MailerTestModule.register(options)` accepts any `MailerOptions` **except** `transport` and `transports`: templates, i18n, `defaults`, `intercept`, `suppress`, plugins and so on. The module's `TestMailbox` is the transport: each email is built once, as a real transport would build it (stream attachments included), and kept in memory, so nothing leaves the process. The module is global and provides `MailerService`, `MailerBatchService`, `MailerEventService` and `TestMailbox`.

`retry` defaults to `false` in tests, so a simulated failure fails right away. Pass `retry` explicitly to test retry behavior.

## Querying the mailbox

| Member | Description |
| --- | --- |
| `mails` | Every captured email, oldest first |
| `last` | The most recent email, or `undefined` |
| `find(query?)` | The latest email matching the query, or `undefined` |
| `filter(query?)` | Every email matching the query |
| `assertSent(query?)` | Returns the latest match, or throws listing what was sent |
| `assertNotSent(query?)` | Throws if any email matches (by default: if any email was sent) |
| `assertCount(count, query?)` | Throws unless exactly `count` emails match |
| `failNext(error?)` | Makes the next send fail with `error`; call it again to queue more failures |
| `clear()` | Forgets captured emails and pending failures |

A query matches when every field given matches:

| Field | Matches |
| --- | --- |
| `to` | A recipient in `to`, `cc`, `bcc` or the envelope (case-insensitive) |
| `subject` | The exact subject, or a `RegExp` |
| `template` | The template name |
| `mail` | The mail class passed to `send(MailClass)` |
| `where` | Any other condition: `(mail: CapturedMail) => boolean` |

```typescript
mailbox.assertCount(2, { subject: /invoice/i });
mailbox.assertNotSent({ to: 'bounced@example.com' });
mailbox.assertSent({ where: (mail) => mail.attachments.length === 1 });
```

## Captured emails

Each entry is a `CapturedMail` with the fields as sent, after templates were rendered:

| Field | Description |
| --- | --- |
| `messageId` | The `Message-ID` |
| `from` | The sender address |
| `to`, `cc`, `bcc` | Recipient addresses as plain strings |
| `subject`, `html`, `text` | The rendered content |
| `template`, `context`, `locale` | What was passed to the template |
| `headers`, `attachments` | As given to nodemailer |
| `mailable` | The mail class, when sent with `send(MailClass)` |
| `envelope` | The SMTP envelope: `{ from, to }`, with every recipient |
| `raw` | The MIME source, as an `.eml` file holds it |
| `sentAt` | When it was captured |
| `links` | Every `href` in the HTML body, entities decoded |
| `link(match)` | The first link containing the string (or matching the `RegExp`), parsed as a `URL`; throws if none |
| `attachment(filename)` | The attachment with that filename; throws if none |

```typescript
const mail = mailbox.assertSent({ to: 'ada@example.com' });
const invoice = mail.attachment('invoice.pdf');
expect(invoice.contentType).toBe('application/pdf');
expect(mail.raw).toContain('X-Invoice-Id: 42');
```

## Simulating failures

```typescript
it('reports a bounced address', async () => {
  mailbox.failNext(Object.assign(new Error('550 No such user'), { responseCode: 550 }));

  await expect(service.notify('nobody@example.com')).rejects.toThrow('550');
  mailbox.assertNotSent();
});
```

To test retries, enable them and use a fast backoff:

```typescript
MailerTestModule.register({ retry: { attempts: 2, backoff: { delay: 0, jitter: 'none' } } });

mailbox.failNext(Object.assign(new Error('Connection lost'), { code: 'ECONNECTION' }));
await service.notify('ada@example.com');
mailbox.assertCount(1); // the second attempt was captured
```

Call `mailbox.clear()` in a `beforeEach` when one mailbox is shared across tests.

## Using `TestMailbox` as a transport

`TestMailbox` is also a nodemailer transport. Use it directly when you build the module yourself, for example to test your real `MailerModule` configuration:

```typescript
import { Test } from '@nestjs/testing';
import { MailerModule, TestMailbox } from '@nestjs-modules/mailer';

const mailbox = new TestMailbox();

const moduleRef = await Test.createTestingModule({
  imports: [
    MailerModule.forRoot({
      transport: mailbox,
      retry: false,
    }),
  ],
}).compile();
```

Its `send()` result looks like a successful SMTP send: `accepted` lists the envelope recipients, `response` is `250 OK: captured by TestMailbox`, and `message` is a Buffer with the raw MIME source (CRLF line endings).

Raw messages (`raw`, as `@nestjs/mail` sends them) are captured too; their `from`, `to`, `cc` and `subject` are read from the MIME headers (`rawHeader()`).

### Capturing next to another transport

`mailbox.plugin()` returns a nodemailer `stream` plugin that captures every email while your configured transport still sends it, for example in an end-to-end test against a local SMTP catcher:

```typescript
const mailbox = new TestMailbox();

MailerModule.forRoot({
  transport: { host: 'localhost', port: 1025, ignoreTLS: true },
  plugins: [mailbox.plugin()],
});
```

## Without Nest

`MailerService` can be created directly, without a Nest module or a transport factory, which is handy in plain unit tests or scripts:

```typescript
import { MailerService, TestMailbox } from '@nestjs-modules/mailer';

const mailbox = new TestMailbox();
const mailer = new MailerService({ transport: mailbox, retry: false });

await mailer.sendMail({ to: 'ada@example.com', subject: 'Hi', text: 'Hi' });
mailbox.assertSent({ subject: 'Hi' });
```

Mail classes are then created with `new` (no dependency injection).

::: tip
`TestMailbox`, `FileTransport` and `LogTransport` never deliver email. If one is configured while `NODE_ENV` is `production`, the mailer logs a warning at startup.
:::
