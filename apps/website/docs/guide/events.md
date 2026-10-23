---
title: Events
---

# Events

The mailer publishes an event at every step of a send (before, after, on error, on each retry and failover, when recipients are suppressed, and for queued jobs), so you can log deliveries, record metrics or alert on failures without wrapping `MailerService`. In v4 events are published three ways, and you can use any of them: an RxJS stream that needs no extra package, `@nestjs/event-emitter` listeners, and `node:diagnostics_channel` for APM tools.

## Available events

| `MailerEvent` | Name | When |
| --- | --- | --- |
| `BEFORE_SEND` | `mailer.before_send` | Before the first attempt |
| `AFTER_SEND` | `mailer.after_send` | After a successful send |
| `SEND_ERROR` | `mailer.send_error` | When the send fails for good (after retries and failover) |
| `RETRY` | `mailer.retry` | A transient failure is about to be retried |
| `FAILOVER` | `mailer.failover` | The transporter failed and the next one in `failover` is tried |
| `SUPPRESSED` | `mailer.suppressed` | `suppress` dropped one or more recipients |
| `QUEUED` | `mailer.queued` | An email was added to the queue |
| `QUEUE_COMPLETED` | `mailer.queue.completed` | A queued email was sent |
| `QUEUE_FAILED` | `mailer.queue.failed` | A queued email failed |

## Payload

Every event carries a `MailerEventPayload`:

| Field | Events | Description |
| --- | --- | --- |
| `mailOptions` | all | The mail options being sent |
| `timestamp` | all | When the event happened |
| `result` | `AFTER_SEND`, `QUEUE_COMPLETED` | The nodemailer result (`messageId`, `accepted`, …) |
| `error` | `SEND_ERROR`, `RETRY`, `FAILOVER`, `QUEUE_FAILED` | The error. On `SEND_ERROR` it is the [typed error](./errors.md) the caller receives |
| `attempt` | `AFTER_SEND`, `SEND_ERROR`, `RETRY` | The attempt that just finished, `1` for the first |
| `permanent` | `SEND_ERROR` | Whether retrying could not help (see [what is retried](./reliability.md#what-is-retried)) |
| `transporterName` | `AFTER_SEND`, `SEND_ERROR`, `RETRY`, `FAILOVER` | The named transporter involved (`undefined` for the default one). For `FAILOVER`, the one tried next |
| `durationMs` | `AFTER_SEND`, `SEND_ERROR` | How long the send took, retries included |
| `suppressed` | `SUPPRESSED` | The addresses that were dropped |

## RxJS stream

`MailerEventService.events$` emits every event as a `MailerEventRecord` (the payload plus its `event` name). It needs no extra package:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailerEvent, MailerEventService } from '@nestjs-modules/mailer';
import { filter } from 'rxjs';

@Injectable()
export class MailMetrics implements OnModuleInit {
  constructor(private readonly mailerEvents: MailerEventService) {}

  onModuleInit() {
    this.mailerEvents.events$
      .pipe(filter((record) => record.event === MailerEvent.SEND_ERROR))
      .subscribe((record) => {
        console.error(
          `Email failed after ${record.attempt} attempt(s)`,
          record.permanent ? '(permanent)' : '(transient)',
          record.error?.message,
        );
      });
  }
}
```

## `@nestjs/event-emitter`

Install the package and import `EventEmitterModule`; the mailer finds `EventEmitter2` automatically:

```bash
pnpm add @nestjs/event-emitter
```

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    MailerModule.forRoot({ transport: process.env.SMTP_URL }),
  ],
})
export class AppModule {}
```

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailerEvent, MailerEventPayload } from '@nestjs-modules/mailer';

@Injectable()
export class EmailEventListener {
  @OnEvent(MailerEvent.AFTER_SEND)
  handleSent(payload: MailerEventPayload) {
    console.log('Sent to', payload.mailOptions.to, 'in', payload.durationMs, 'ms');
    console.log('Message ID:', payload.result?.messageId);
  }

  @OnEvent(MailerEvent.RETRY)
  handleRetry(payload: MailerEventPayload) {
    console.warn(`Attempt ${payload.attempt} failed, retrying:`, payload.error?.message);
  }

  @OnEvent(MailerEvent.SEND_ERROR)
  handleError(payload: MailerEventPayload) {
    console.error('Email failed:', payload.error?.message);
  }
}
```

::: info
In v3 the `EventEmitter2` instance was never actually injected, so `@OnEvent()` listeners did not fire. v4 fixes this: they now receive every event.
:::

### Another emitter

To publish to a different emitter, provide anything with an `emit(event, payload)` method under the `MAILER_EVENT_EMITTER` token, where the mailer module can see it. With `forRootAsync()`, use `extraProviders`:

```typescript
import { Module } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { MAILER_EVENT_EMITTER, MailerModule } from '@nestjs-modules/mailer';

export const mailEvents = new EventEmitter();

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: () => ({ transport: process.env.SMTP_URL }),
      extraProviders: [{ provide: MAILER_EVENT_EMITTER, useValue: mailEvents }],
    }),
  ],
})
export class AppModule {}
```

## `diagnostics_channel`

Each event is also published to the `node:diagnostics_channel` channel `nestjs-modules:<event name>` (for example `nestjs-modules:mailer.after_send`), with the same record as `events$`. APM and tracing tools can subscribe without touching your Nest app. `mailerChannelName()` returns the channel name of an event:

```typescript
import { subscribe } from 'node:diagnostics_channel';
import { MailerEvent, MailerEventRecord, mailerChannelName } from '@nestjs-modules/mailer';

subscribe(mailerChannelName(MailerEvent.AFTER_SEND), (message) => {
  const record = message as MailerEventRecord;
  console.log('mail sent', record.durationMs);
});
```

## Use cases

### Delivery log

```typescript
@OnEvent(MailerEvent.AFTER_SEND)
async logEmail(payload: MailerEventPayload) {
  await this.emailLogService.create({
    to: payload.mailOptions.to,
    subject: payload.mailOptions.subject,
    template: payload.mailOptions.template,
    sentAt: payload.timestamp,
    messageId: payload.result?.messageId,
    transporter: payload.transporterName ?? 'default',
  });
}
```

### Metrics

```typescript
@OnEvent(MailerEvent.AFTER_SEND)
trackSuccess(payload: MailerEventPayload) {
  this.metrics.histogram('emails.duration_ms', payload.durationMs);
}

@OnEvent(MailerEvent.SEND_ERROR)
trackFailure(payload: MailerEventPayload) {
  this.metrics.increment('emails.failed', { permanent: String(payload.permanent) });
}
```

::: tip
Emitting never throws: a failing `@nestjs/event-emitter` listener is logged as a warning and does not fail the send. `MailerEventService.isAvailable()` tells you whether an emitter is wired; `events$` and diagnostics channels work regardless.
:::
