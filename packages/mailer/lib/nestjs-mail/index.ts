/**
 * Interoperability with the official `@nestjs/mail` package:
 * `import { ... } from '@nestjs-modules/mailer/nestjs-mail'`.
 */
export { MailerServiceTransport } from './mailer-service.transport';
export type {
  MailMessageLike,
  MailTemplateEngineLike,
  MailTemplateOutputLike,
  MailTemplateRenderOptionsLike,
  MailTransportLike,
  MailTransportResultLike,
  MailTransportSendOptionsLike,
} from './nestjs-mail.types';
export {
  classifyError,
  NodemailerMailTransport,
} from './nodemailer-mail.transport';
export {
  TemplateAdapterEngine,
  TemplateAdapterEngineOptions,
} from './template-adapter.engine';
