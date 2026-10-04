---
'@nestjs-modules/mailer': patch
---

Restore the `@nestjs-modules/mailer/dist/*` deep import paths (e.g. `@nestjs-modules/mailer/dist/adapters/handlebars.adapter`) that stopped resolving after the `exports` map was introduced in a minor release. Both the legacy and the current `adapters/*` paths now resolve at runtime and in TypeScript (`node10`, `node16` and `bundler` resolution), with or without a `.js` extension.
