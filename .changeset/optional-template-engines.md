---
'@nestjs-modules/mailer': major
---

Template engines are no longer installed automatically.

`ejs`, `handlebars`, `liquidjs`, `mjml`, `nunjucks`, `preview-email`, `pug` and their `@types/*` packages were listed both as optional `peerDependencies` and as `optionalDependencies`. npm, pnpm and yarn install `optionalDependencies` by default, so every project got all of them (and their transitive dependencies) even when using a single engine. They are now only optional peer dependencies, as the documentation already described (#1320).

**Migration:** install the engine used by your adapter, e.g. `pnpm add handlebars` for `HandlebarsAdapter`, and `preview-email` if you use the `preview` option. Projects that already followed the installation guide need no changes.
