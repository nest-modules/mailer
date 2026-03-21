---
sidebar_position: 10
title: Health Check
---

# Health Check

Monitor mailer health using `@nestjs/terminus`.

## Setup

Install terminus:

```bash
pnpm add @nestjs/terminus
```

## Usage

Inject `MailerHealthIndicator` in your health controller:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { MailerHealthIndicator } from '@nestjs-modules/mailer';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mailerHealth: MailerHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mailerHealth.isHealthy('mailer'),
    ]);
  }
}
```

## Response

```json
{
  "status": "ok",
  "info": {
    "mailer": {
      "status": "up",
      "transporters": "up"
    }
  }
}
```

## With Queue

If `MailerQueueModule` is imported, the health check also reports queue metrics:

```json
{
  "status": "ok",
  "info": {
    "mailer": {
      "status": "up",
      "transporters": "up",
      "queue": {
        "status": "up",
        "waiting": 3,
        "active": 1,
        "completed": 245,
        "failed": 2,
        "delayed": 0
      }
    }
  }
}
```

## Custom Health Key

```typescript
// Use a custom key for the health response
await this.mailerHealth.isHealthy('email-service');
```

:::tip
`MailerHealthIndicator` is automatically available when you import `MailerModule`. No additional configuration needed. It uses the existing `verifyAllTransporters()` method to check SMTP connectivity.
:::
