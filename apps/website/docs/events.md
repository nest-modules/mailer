---
sidebar_position: 7
title: Events
---

# Event System

React to email lifecycle events using `@nestjs/event-emitter`.

## Setup

Install the event emitter package:

```bash
pnpm add @nestjs/event-emitter
```

Register it in your app module:

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    MailerModule.forRoot({ ... }),
  ],
})
export class AppModule {}
```

## Available Events

| Event | Description |
|-------|-------------|
| `mailer.before_send` | Emitted before an email is sent |
| `mailer.after_send` | Emitted after successful send |
| `mailer.send_error` | Emitted when send fails |
| `mailer.queued` | Emitted when email is added to queue |
| `mailer.queue.completed` | Emitted when queued email is sent |
| `mailer.queue.failed` | Emitted when queued email fails |

## Listening to Events

Use the `@OnEvent()` decorator:

```typescript
import { OnEvent } from '@nestjs/event-emitter';
import { MailerEvent, MailerEventPayload } from '@nestjs-modules/mailer';

@Injectable()
export class EmailEventListener {
  @OnEvent(MailerEvent.AFTER_SEND)
  handleEmailSent(payload: MailerEventPayload) {
    console.log('Email sent to:', payload.mailOptions.to);
    console.log('Message ID:', payload.result?.messageId);
  }

  @OnEvent(MailerEvent.SEND_ERROR)
  handleEmailError(payload: MailerEventPayload) {
    console.error('Email failed:', payload.error?.message);
    // Log to monitoring, retry, etc.
  }
}
```

## Use Cases

### Logging

```typescript
@OnEvent(MailerEvent.AFTER_SEND)
async logEmail(payload: MailerEventPayload) {
  await this.emailLogService.create({
    to: payload.mailOptions.to,
    subject: payload.mailOptions.subject,
    template: payload.mailOptions.template,
    sentAt: payload.timestamp,
    messageId: payload.result?.messageId,
  });
}
```

### Metrics

```typescript
@OnEvent(MailerEvent.AFTER_SEND)
trackSuccess() {
  this.metricsService.increment('emails.sent');
}

@OnEvent(MailerEvent.SEND_ERROR)
trackFailure() {
  this.metricsService.increment('emails.failed');
}
```

:::info
The event system is **optional**. If `@nestjs/event-emitter` is not installed, events are silently skipped with zero overhead.
:::
