---
title: "Using Multiple SMTP Transporters in Production"
authors:
  - name: Juan David
tags: [nestjs, smtp, transporters, production]
---

Many production applications need more than one email provider. You might send transactional emails through one service and marketing emails through another, or you might want a fallback transporter for reliability.

<!-- truncate -->

## Why Multiple Transporters?

Common scenarios:

- **Separate transactional and marketing emails** - different providers optimize for different use cases
- **Failover** - if your primary SMTP goes down, switch to a backup
- **Regional compliance** - send emails from specific regions based on user location
- **Cost optimization** - use a cheaper provider for bulk sends

## Configuration

Define multiple transporters in your module setup:

```typescript
MailerModule.forRoot({
  defaults: {
    from: '"App" <noreply@example.com>',
  },
  // Default transporter
  transport: {
    host: 'smtp.primary.com',
    port: 587,
    auth: {
      user: 'primary@example.com',
      pass: 'password',
    },
  },
});
```

Then add additional transporters at runtime:

```typescript
@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {
    // Register additional transporters
    this.mailerService.addTransporter('marketing', {
      host: 'smtp.marketing.com',
      port: 587,
      auth: {
        user: 'marketing@example.com',
        pass: 'password',
      },
    });

    this.mailerService.addTransporter('backup', {
      host: 'smtp.backup.com',
      port: 587,
      auth: {
        user: 'backup@example.com',
        pass: 'password',
      },
    });
  }
}
```

## Sending with a Specific Transporter

Use the `transporterName` option in `sendMail()`:

```typescript
// Uses the default transporter
await this.mailerService.sendMail({
  to: 'user@example.com',
  subject: 'Order Confirmation',
  template: 'order-confirmation',
  context: { orderId: '12345' },
});

// Uses the marketing transporter
await this.mailerService.sendMail({
  transporterName: 'marketing',
  to: 'user@example.com',
  subject: 'Weekly Newsletter',
  template: 'newsletter',
  context: { edition: 42 },
});
```

## Simple Failover Pattern

```typescript
async sendWithFallback(mailOptions: ISendMailOptions) {
  try {
    return await this.mailerService.sendMail(mailOptions);
  } catch (error) {
    console.warn('Primary transporter failed, trying backup:', error.message);
    return await this.mailerService.sendMail({
      ...mailOptions,
      transporterName: 'backup',
    });
  }
}
```

## Tips

- **Use environment variables** for all SMTP credentials. Never hardcode them.
- **Monitor delivery rates** per transporter to catch issues early.
- **Set timeouts** on your transporters to avoid hanging requests.

Check the [Configuration](/docs/configuration#multiple-transporters) docs for more details.
