---
sidebar_position: 8
title: Batch Sending
---

# Batch Sending

Send multiple emails efficiently with concurrency control.

## Usage

Inject `MailerBatchService`:

```typescript
import { MailerBatchService } from '@nestjs-modules/mailer';

@Injectable()
export class NewsletterService {
  constructor(private readonly batchService: MailerBatchService) {}

  async sendNewsletter(subscribers: string[]) {
    const result = await this.batchService.sendBatch({
      messages: subscribers.map((email) => ({
        to: email,
        subject: 'Weekly Newsletter',
        template: 'newsletter',
        context: { email },
      })),
      concurrency: 10,
    });

    console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
    return result;
  }
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `messages` | `ISendMailOptions[]` | required | Array of email options |
| `concurrency` | `number` | `5` | Max concurrent sends |
| `stopOnError` | `boolean` | `false` | Stop batch on first error |

## Result

The `BatchResult` contains per-message results:

```typescript
interface BatchResult {
  total: number;       // Total messages attempted
  sent: number;        // Successfully sent
  failed: number;      // Failed to send
  results: Array<{
    index: number;     // Original message index
    success: boolean;
    result?: SentMessageInfo;
    error?: Error;
  }>;
}
```

## Error Handling

By default, failures don't stop the batch. Use `stopOnError` to halt on first failure:

```typescript
const result = await this.batchService.sendBatch({
  messages: [...],
  stopOnError: true,  // Stops after first failure
});

// Check individual results
result.results
  .filter(r => !r.success)
  .forEach(r => console.error(`Message ${r.index} failed:`, r.error));
```

## With Named Transporters

Each message can target a different transporter:

```typescript
await this.batchService.sendBatch({
  messages: [
    { to: 'a@example.com', template: 'alert', transporterName: 'transactional' },
    { to: 'b@example.com', template: 'promo', transporterName: 'marketing' },
  ],
});
```

:::tip
`MailerBatchService` uses `MailerService.sendMail()` internally, so all events are emitted for each message and all template/i18n features work.
:::
