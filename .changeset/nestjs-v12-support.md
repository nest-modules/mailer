---
'@nestjs-modules/mailer': minor
---

Support NestJS 12. The module is tested against NestJS 11 and 12 in CI, and Nest types are now imported from the `@nestjs/common` entrypoint instead of the internal `@nestjs/common/interfaces` path, so the published declarations resolve with `node16`/`bundler` module resolution on NestJS 12. NestJS 12 requires Node.js >= 20.19 (or >= 22.12).
