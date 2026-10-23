---
title: Email Queue
---

# Email Queue

Sending an email inside an HTTP request makes the response wait on a mail server and loses the email if the process dies. The queue is one of three optional ways to deliver; see [direct, queue or outbox](./outbox.md#direct-queue-or-outbox) to choose. `MailerQueueModule` hands emails to a [BullMQ](https://docs.bullmq.io/) queue backed by Redis instead: a worker sends them in the background, BullMQ retries failed jobs, and emails can be scheduled for later. In v4, permanent failures fail the job at once, redeliveries keep the same `Message-ID`, and `schedule()` and `concurrency` are new.

## Setup

Install dependencies:

```bash
pnpm add bullmq
```

Import `MailerQueueModule` alongside `MailerModule`:

```typescript
import { MailerModule, MailerQueueModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: { host: 'smtp.example.com', port: 587 },
    }),
    MailerQueueModule.register({
      // Set `global: true` so `MailerQueueService` can be injected in any
      // feature module without re-importing `MailerQueueModule`.
      global: true,
      connection: {
        host: 'localhost',
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
})
export class AppModule {}
```

## Enqueuing Emails

Use `MailerQueueService` instead of `MailerService.sendMail()`:

```typescript
import { MailerQueueService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationService {
  constructor(private readonly queueService: MailerQueueService) {}

  async sendWelcomeEmail(user: User) {
    await this.queueService.enqueue({
      to: user.email,
      subject: 'Welcome!',
      template: 'welcome',
      context: { name: user.name },
    });
  }
}
```

## Scheduling

`schedule()` sends an email at a given time. A time in the past sends it right away:

```typescript
await this.queueService.schedule(
  {
    to: user.email,
    subject: 'Your trial ends tomorrow',
    template: 'trial-ending',
    context: { name: user.name },
  },
  new Date(user.trialEndsAt.getTime() - 24 * 60 * 60 * 1000),
);
```

It takes the same job options as `enqueue()` as a third argument; `delay` is computed from the date.

## Batch Enqueue

Add multiple emails to the queue at once:

```typescript
await this.queueService.enqueueBatch(
  users.map(user => ({
    to: user.email,
    subject: 'System Update',
    template: 'notification',
    context: { name: user.name },
  })),
);
```

## Job Options

Override defaults per job:

```typescript
// High priority with delay
await this.queueService.enqueue(
  { to: 'vip@example.com', subject: 'VIP Alert', template: 'vip' },
  { priority: 1, delay: 5000 },
);

// More retries for critical emails
await this.queueService.enqueue(
  { to: 'admin@example.com', subject: 'Report', template: 'report' },
  { attempts: 10 },
);
```

## Queue Metrics

Monitor queue health:

```typescript
const metrics = await this.queueService.getMetrics();
console.log(metrics);
// { waiting: 5, active: 2, completed: 150, failed: 3, delayed: 1 }
```

## Concurrency

The worker sends up to 5 emails at once by default. Set `concurrency` to change it:

```typescript
MailerQueueModule.register({
  connection: { host: 'localhost', port: 6379 },
  concurrency: 20,
})
```

## Async Configuration

```typescript
MailerQueueModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: {
      host: config.get('REDIS_HOST'),
      port: config.get('REDIS_PORT'),
    },
  }),
})
```

## Retries and permanent failures

BullMQ owns the retries of queued emails, so attempts are never multiplied:

- Jobs are sent with `retry: false`, so the mailer's own [retries](./reliability.md) are off for them (unless the job data sets `retry` itself). [Failover](./reliability.md#failover) between transporters still applies within each attempt.
- A **permanent** failure (a rejected recipient, a template error, see [what is retried](./reliability.md#what-is-retried)) is rethrown as BullMQ's `UnrecoverableError`, with the original error as `cause`. The job fails at once instead of using up its attempts.
- `enqueue()`, `enqueueBatch()` and `schedule()` store a random `idempotencyKey` with every job (unless the email already has one), so every retry of the job carries the same `Message-ID`, mailbox providers can drop a duplicate, and [duplicate protection](./reliability.md#duplicate-protection) never blocks a retry. Two jobs never share a key, even after BullMQ reuses a removed job's id.
- For jobs added to the queue directly (not through `MailerQueueService`), the worker falls back to `mailer-job:<queue name>:<job id>:<job timestamp>`.

Mail classes are not queued directly, because job data must be serializable. Enqueue the plain options instead, or render the class first:

```typescript
const mail = await this.mailerService.render(WelcomeMail, { data: user });
await this.queueService.enqueue({
  to: user.email,
  subject: mail.subject,
  html: mail.html,
  text: mail.text,
});
```

## Retry Strategy

The default exponential backoff retries with increasing delays:

| Attempt | Delay |
|---------|-------|
| 1st retry | 1s |
| 2nd retry | 2s |
| 3rd retry | 4s |

Use `fixed` backoff for constant delay:

```typescript
defaultJobOptions: {
  attempts: 5,
  backoff: { type: 'fixed', delay: 30000 }, // 30s between retries
}
```

::: info
The queue module is **completely optional** and independent from `MailerModule`. It requires Redis and `bullmq` to be installed.
:::
