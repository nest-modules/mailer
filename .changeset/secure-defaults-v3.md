---
'@nestjs-modules/mailer': major
---

Secure defaults for 3.0.

- **Breaking:** `{{key}}` placeholders in an inline `html` string are now HTML-escaped. Use `{{{key}}}` to insert trusted markup. Subject and text templates are not escaped.
- **Breaking:** CSS inlining no longer fetches remote stylesheets. `loadRemoteStylesheets` defaults to `false` and is kept when you pass your own `inlineCssOptions`; set it to `true` to opt back in.
- **Breaking:** the Pug adapter compiles with `template.options` only. Context values can no longer change compiler options such as `basedir`, `filename` or `plugins`. They are still available as template variables.
- **Breaking:** `MailerHealthIndicator` no longer returns the error message when transporter verification throws. The error is logged instead.
- Placeholder interpolation only reads the context's own properties, so keys like `constructor` are never rendered.
