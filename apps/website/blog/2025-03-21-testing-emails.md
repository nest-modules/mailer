---
title: "Testing Email Sending in NestJS"
authors:
  - name: Juan David
tags: [nestjs, testing, jest, e2e]
---

Testing email functionality without actually sending emails is essential for any CI/CD pipeline. Here are practical patterns for unit and integration testing with `@nestjs-modules/mailer`.

<!-- truncate -->

## Unit Testing with a Mock

The simplest approach: mock `MailerService` in your unit tests.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let mailerService: MailerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: MailerService,
          useValue: {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
          },
        },
      ],
    }).compile();

    service = module.get(NotificationService);
    mailerService = module.get(MailerService);
  });

  it('should send welcome email with correct parameters', async () => {
    await service.sendWelcomeEmail('user@example.com', 'John');

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Welcome'),
        context: expect.objectContaining({ name: 'John' }),
      }),
    );
  });

  it('should throw when email fails', async () => {
    jest.spyOn(mailerService, 'sendMail').mockRejectedValueOnce(
      new Error('SMTP connection refused'),
    );

    await expect(
      service.sendWelcomeEmail('user@example.com', 'John'),
    ).rejects.toThrow('SMTP connection refused');
  });
});
```

## Integration Testing with JSON Transport

For integration tests where you want to verify the full pipeline (templates, context, attachments) without sending real emails, use Nodemailer's `jsonTransport`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MailerModule, MailerService } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';

describe('Email Integration', () => {
  let mailerService: MailerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        MailerModule.forRoot({
          transport: { jsonTransport: true },
          template: {
            dir: join(__dirname, '../templates'),
            adapter: new HandlebarsAdapter(),
          },
        }),
      ],
    }).compile();

    mailerService = module.get(MailerService);
  });

  it('should render welcome template correctly', async () => {
    const result = await mailerService.sendMail({
      to: 'user@example.com',
      subject: 'Welcome!',
      template: 'welcome',
      context: { name: 'John', code: 'ABC123' },
    });

    // jsonTransport returns the message as a JSON string
    const message = JSON.parse(result.message);
    expect(message.subject).toBe('Welcome!');
    expect(message.html).toContain('John');
    expect(message.html).toContain('ABC123');
  });
});
```

The `jsonTransport` option tells Nodemailer to return the composed email as a JSON object instead of sending it. This lets you inspect the fully rendered HTML, subject, headers, and attachments.

## Testing with Ethereal (Dev/Staging)

For manual testing or staging environments, [Ethereal](https://ethereal.email/) provides a free fake SMTP service that captures emails without delivering them:

```typescript
import * as nodemailer from 'nodemailer';

// Generate test SMTP credentials
const testAccount = await nodemailer.createTestAccount();

MailerModule.forRoot({
  transport: {
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  },
});
```

After sending, you can view captured emails at `https://ethereal.email/messages`.

## Tips

- **Use `jsonTransport` in CI** - it's fast, has no network dependencies, and lets you assert on rendered output.
- **Mock at the service level for unit tests** - don't pull in the full `MailerModule` when you only need to verify your service logic.
- **Use Ethereal for visual testing** - when you need to see what the email actually looks like before going to production.
- **Test error paths** - verify your code handles SMTP failures gracefully.

Check the [Getting Started](/docs/getting-started) guide for setup instructions.
