---
'@nestjs-modules/mailer': patch
---

Fix several error-handling bugs found while bringing unit test coverage to 100%:

- `HandlebarsAdapter` no longer throws a `TypeError` after reporting a missing template, and skips unreadable partials
- `EjsAdapter`, `HandlebarsAdapter` and `PugAdapter` no longer call the callback twice when CSS inlining fails
- Render-time errors (and EJS async rejections) are now passed to the callback instead of being thrown or left unhandled
- `EjsAdapter` resolves nested templates from `template.dirs` correctly
- `LiquidAdapter` now forwards its whole config (`globals`, `strictVariables`, ...) to Liquid
- `MjmlAdapter('')` no longer crashes and completes the send when no engine is configured; synchronous mjml v4 errors reach the callback
- `verifyAllTransporters()` (and the health indicator) work when only named `transports` are configured
- `rateLimit.maxMessages` below 1 is treated as 1
