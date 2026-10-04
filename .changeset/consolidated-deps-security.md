---
'@nestjs-modules/mailer': patch
---

Remove the undeclared runtime dependency on `lodash` (fixes `Cannot find module 'lodash'` with strict package managers such as pnpm), make the public typings compatible with the types bundled in nodemailer >= 10, and update dependencies to address known security advisories.
