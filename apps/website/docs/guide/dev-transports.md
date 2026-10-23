---
title: Dev transports
---

# Dev transports

During local development you usually want to *see* the emails your app sends without an SMTP server or a sandbox account. v4 ships two nodemailer transports for that: `FileTransport` writes every email to an `.eml` file (open it with any mail client) plus an `.html` file for the browser, and `LogTransport` prints a summary to the Nest logger. Both send nothing and work with templates, mail classes and every other feature.

## FileTransport

```typescript
import { Module } from '@nestjs/common';
import { FileTransport, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: new FileTransport({ directory: 'var/mail' }),
      defaults: { from: 'App <app@example.com>' },
    }),
  ],
})
export class AppModule {}
```

| Option | Default | Description |
| --- | --- | --- |
| `directory` | `'var/mail'` | Where files are written, resolved from the working directory and created when missing |
| `html` | `true` | Also write the HTML body next to the `.eml` |
| `log` | `true` | Log the path of every file written |

Files are named after the send time followed by the `Message-ID` stripped to letters, digits and dashes (for example `var/mail/2026-10-23T09-15-00-000Z-a1b2c3d4examplecom.eml`). The send result includes the file `path`.

Add the directory to `.gitignore`.

## LogTransport

```typescript
import { Logger, Module } from '@nestjs/common';
import { LogTransport, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: new LogTransport({ body: true, logger: new Logger('Mail') }),
    }),
  ],
})
export class AppModule {}
```

| Option | Default | Description |
| --- | --- | --- |
| `body` | `false` | Log the text body too |
| `logger` | `new Logger('LogTransport')` | Any Nest `LoggerService` |

Each email logs its subject, sender, envelope recipients and attachment names.

## Production warning

These transports (and [`TestMailbox`](./testing.md)) never deliver email. If one is configured as `transport` or in `transports` while `NODE_ENV` is `production`, the mailer logs a warning at startup naming the option, since that is almost always a configuration mistake. Custom transports can opt into the same check by setting the exported `LOCAL_TRANSPORT` symbol:

```typescript
import { LOCAL_TRANSPORT } from '@nestjs-modules/mailer';

export class SlackPreviewTransport {
  readonly name = 'SlackPreviewTransport';
  readonly version = '1.0.0';
  readonly [LOCAL_TRANSPORT] = true;

  send(mail: unknown, callback: (err: Error | null, info?: unknown) => void) {
    // post a summary to Slack instead of delivering…
    callback(null, { messageId: 'preview' });
  }
}
```

## Choosing per environment

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FileTransport, MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport:
          config.get('NODE_ENV') === 'production'
            ? config.get('SMTP_URL')
            : new FileTransport(),
      }),
    }),
  ],
})
export class AppModule {}
```

## Related

- [Email previews](./preview.md) render emails in the browser on demand, without sending.
- The [`preview` option](./configuration.md#preview-emails) opens each sent email in the browser through `preview-email`.
- For tests, use [`TestMailbox`](./testing.md) instead: it keeps emails in memory and adds assertions.
