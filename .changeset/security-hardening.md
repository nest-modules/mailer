---
'@nestjs-modules/mailer': patch
---

Security hardening:

- External stylesheet inlining (`<link rel="stylesheet">` in Handlebars/EJS templates) now only reads `.css` files located inside `template.dir` (or `cssBaseUrl`). Previously an absolute or `../` href — including one injected through an unescaped context value — could inline any readable file from the server into the email. The tag matcher also runs in linear time now (it was vulnerable to ReDoS on large rendered output).
- i18n: locales that are not BCP 47-like tags (e.g. `../../uploads`) are ignored and the default locale is used, preventing path traversal through a user-provided `locale`.
- `textTemplate` files must live inside `template.dir`.
- Template caches no longer inherit from `Object.prototype`.
- Raise the optional peer floors to `ejs >= 3.1.10` and `pug >= 3.0.3`, which fix known template-injection CVEs.

If you reference stylesheets outside the template directory, set `cssBaseUrl` to a common parent directory.
