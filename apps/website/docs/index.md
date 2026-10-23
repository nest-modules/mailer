---
layout: home
title: Home

hero:
  name: NestJS Mailer
  text: Email for NestJS, built on Nodemailer
  tagline: Use what you need. SMTP or HTTP APIs, sent directly, queued or through an outbox, with sendMail(), mail classes or @nestjs/mail.
  image:
    src: /nestjs.svg
    alt: NestJS Mailer
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What's new in v4
      link: /blog/2026-10-23-v4
    - theme: alt
      text: Template playground
      link: /preview
    - theme: alt
      text: GitHub
      link: https://github.com/nest-modules/mailer

features:
  - title: Typed mail classes
    details: Write each email once as an injectable class with typed data, then send(WelcomeMail, { to, data }) from anywhere. Compatible with @nestjs/mail mail classes.
    link: /guide/mailables
    linkText: Mail classes
  - title: Reliable delivery
    details: Transient failures are retried with backoff, never at the risk of a duplicate. Failover, typed errors, validation, AbortSignal, idempotency keys and graceful shutdown.
    link: /guide/reliability
    linkText: Reliability
  - title: Works with @nestjs/mail
    details: Give the official @nestjs/mail any nodemailer transport, this module's failover and delivery rules, or Handlebars, Pug, EJS, MJML, Liquid and Nunjucks templates.
    link: /guide/nestjs-mail
    linkText: Interop
  - title: Test mailbox
    details: MailerTestModule runs the real mailer without sending. Assert on recipients, subjects, links and attachments with TestMailbox.
    link: /guide/testing
    linkText: Testing
  - title: Previews and dev transports
    details: Browse rendered emails at /_mailer during development, or write them to .eml files or the log instead of sending.
    link: /guide/preview
    linkText: Email previews
  - title: Delivery rules
    details: Redirect recipients to a QA inbox in staging, drop suppressed addresses, and add one-click unsubscribe headers for Gmail and Yahoo.
    link: /guide/delivery-rules
    linkText: Delivery rules
  - title: Multiple template engines
    details: Handlebars, Pug, EJS, Liquid, Nunjucks or MJML, with built-in CSS inlining, i18n and custom template resolvers.
    link: /guide/adapters
    linkText: Template adapters
  - title: Nodemailer or HTTP APIs
    details: SMTP and every nodemailer transport, or zero-dependency Resend, Postmark, SendGrid, SES, Mailgun and Brevo transports. Named transporters, plugins, health checks.
    link: /guide/http-transports
    linkText: HTTP transports
  - title: Queue or outbox
    details: Send in the request, in the background with BullMQ and scheduling, or after your transaction commits through the official @nestjs/outbox.
    link: /guide/outbox#direct-queue-or-outbox
    linkText: Choose how to send
---

<div class="home-install">

::: tip v4 is out
Mail classes, HTTP transports, retries with duplicate protection, typed errors, a transactional outbox, delivery rules, a test mailbox, email previews and interop with the official `@nestjs/mail`. Every piece is optional: [choose your setup](./guide/getting-started.md#choose-your-setup). Read the [announcement](./blog/2026-10-23-v4.md) and the [migration guide](./guide/migration.md).
:::

## Quick Install

```bash
pnpm add @nestjs-modules/mailer nodemailer
```

</div>
