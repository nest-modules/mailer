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

## Third-Party Transports

You can use any Nodemailer-compatible transport plugin:

```typescript
import * as sendgridTransport from 'nodemailer-sendgrid';

MailerModule.forRoot({
  transport: sendgridTransport({ apiKey: 'SG.xxxx' }),
  defaults: {
    from: '"App" <noreply@example.com>',
  },
})
```

Other popular transports:
- `nodemailer-sendgrid` — SendGrid API
- `nodemailer-mailgun-transport` — Mailgun API
- `nodemailer-ses-transport` — AWS SES (also built-in via Nodemailer)

## Docker Deployment

When deploying with Docker, ensure templates are included in the image:

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY dist/ ./dist/
COPY templates/ ./templates/

CMD ["node", "dist/main.js"]
```

:::tip
- Use **absolute paths** for template directories in production
- Set SMTP credentials via environment variables, not hardcoded values
- If using `preview: true`, disable it in production environments
:::

## Webpack / Custom Bundlers

If you bundle your NestJS app with webpack, the `@css-inline/css-inline` WASM binary may not be included. This is handled automatically in v2.1.x+ via lazy-loading — the binary is loaded at runtime from `node_modules` instead of at build time.

If you still encounter issues, exclude it from your webpack config:

```javascript
// webpack.config.js
module.exports = {
  externals: {
    '@css-inline/css-inline': 'commonjs @css-inline/css-inline',
  },
};
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
