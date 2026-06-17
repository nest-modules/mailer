---
'@nestjs-modules/mailer': patch
---

Fix several issues in the mailer package:

- **MjmlAdapter**: handle the Promise returned by `mjml2html` in mjml v5+, so
  rendered HTML is no longer `undefined` (#1312). The adapter now also
  propagates errors from the inner engine.
- **MailerQueueModule**: support a `global` option in both `register` and
  `registerAsync`, allowing `MailerQueueService` to be injected across the
  application without re-importing the module (#1311).
- **TransportType**: re-export `TransportType` from the package entry point so
  custom transports can type their `getTransport()` return value without deep
  imports (#1309).
