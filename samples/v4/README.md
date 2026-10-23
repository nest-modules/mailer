# v4 example

Shows the v4 features of `@nestjs-modules/mailer`: a typed mail class, localized templates, the file transport for development, idempotency keys and the browser preview module.

```bash
pnpm --filter @nestjs-modules/example-v4 start
```

- Open http://localhost:3000/_mailer to preview the emails.
- `curl -X POST localhost:3000/signup -H 'content-type: application/json' -d '{"email":"ada@example.com","name":"Ada"}'` writes the email to `var/mail/`.
