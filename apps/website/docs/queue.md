---
sidebar_position: 9
title: Email Queue
---

# Email Queue

Queue emails for background processing with automatic retries using BullMQ and Redis.

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

:::info
The queue module is **completely optional** and independent from `MailerModule`. It requires Redis and `bullmq` to be installed.
:::
