---
sidebar_position: 5
title: Advanced
---

# Advanced

## Custom Transport Factory

Implement `MailerTransportFactory` to customize how transporters are created:

```typescript
import { MailerTransportFactory } from '@nestjs-modules/mailer';
import { createTransport } from 'nodemailer';

export class CustomTransportFactory implements MailerTransportFactory {
  createTransport(options?: any) {
    return createTransport({
      // your custom transport configuration
    });
  }
}
```

Register it via `forRootAsync()`:

```typescript
MailerModule.forRootAsync({
  useFactory: () => ({
    transport: { host: 'smtp.example.com', port: 587 },
  }),
  extraProviders: [
    {
      provide: MAILER_TRANSPORT_FACTORY,
      useClass: CustomTransportFactory,
    },
  ],
})
```

## Monorepo Structure

This project is organized as a monorepo using [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/):

```
mailer/
  packages/
    mailer/          # @nestjs-modules/mailer (published to npm)
  apps/
    website/         # Documentation site (Docusaurus)
  samples/
    basic/           # Basic usage example
    custom-template-adapter/  # Custom adapter example
```

### Development Commands

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Lint and format
pnpm run check
pnpm run format

# Start documentation site
pnpm --filter @nestjs-modules/website start
```
