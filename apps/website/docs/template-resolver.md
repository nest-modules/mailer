---
sidebar_position: 11
title: Template Resolver
---

# Template Resolver

Load email templates from external sources like databases, S3, or APIs instead of the filesystem.

## Interface

Implement the `TemplateResolver` interface:

```typescript
import { TemplateResolver, ResolvedTemplate } from '@nestjs-modules/mailer';

export class DatabaseTemplateResolver implements TemplateResolver {
  constructor(private readonly templateRepo: TemplateRepository) {}

  async resolve(
    templateName: string,
    context?: Record<string, any>,
  ): Promise<ResolvedTemplate> {
    const template = await this.templateRepo.findByName(templateName);
    return {
      content: template.html,
      metadata: {
        subject: template.subject,
      },
    };
  }
}
```

## Configuration

Pass the resolver in your module config:

```typescript
MailerModule.forRoot({
  transport: { host: 'smtp.example.com', port: 587 },
  template: {
    adapter: new HandlebarsAdapter(),
    resolver: new DatabaseTemplateResolver(templateRepo),
  },
})
```

## How It Works

1. When `sendMail()` is called with a `template` name
2. If a `resolver` is configured and no `html` is provided
3. The resolver is called to fetch the template content
4. The resolved content is set as `html` on the mail options
5. If the resolved template includes `metadata.subject` and no subject was provided, it is applied automatically

## Example: S3 Resolver

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export class S3TemplateResolver implements TemplateResolver {
  private s3 = new S3Client({ region: 'us-east-1' });

  async resolve(templateName: string): Promise<ResolvedTemplate> {
    const command = new GetObjectCommand({
      Bucket: 'my-email-templates',
      Key: `${templateName}.html`,
    });

    const response = await this.s3.send(command);
    const content = await response.Body!.transformToString();

    return { content };
  }
}
```

## Example: API Resolver

```typescript
export class ApiTemplateResolver implements TemplateResolver {
  constructor(private readonly httpService: HttpService) {}

  async resolve(
    templateName: string,
    context?: Record<string, any>,
  ): Promise<ResolvedTemplate> {
    const { data } = await firstValueFrom(
      this.httpService.get(`https://templates.internal/api/${templateName}`),
    );

    return {
      content: data.html,
      metadata: { subject: data.subject },
    };
  }
}
```

:::info
When a template resolver is used, the resolved content bypasses the file-system lookup of template adapters. The adapter's compilation step (variable interpolation, partials, etc.) still applies if you use `html` with template syntax.
:::
