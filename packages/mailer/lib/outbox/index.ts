/**
 * Sending emails through the official transactional outbox, `@nestjs/outbox`:
 * `import { ... } from '@nestjs-modules/mailer/outbox'`.
 */
export {
  DEFAULT_MAILER_OUTBOX_CONSUMER,
  DEFAULT_MAILER_OUTBOX_TOPIC,
  MAILER_OUTBOX_OPTIONS,
} from './mailer-outbox.constants';
export { MailerOutboxHandler } from './mailer-outbox.handler';
export type {
  MailerOutboxAddOptions,
  MailerOutboxMail,
  MailerOutboxMailable,
  MailerOutboxMailablePayload,
  MailerOutboxMailables,
  MailerOutboxMailPayload,
  MailerOutboxModuleOptions,
  MailerOutboxPayload,
} from './mailer-outbox.interfaces';
export { MailerOutboxModule } from './mailer-outbox.module';
export { MailerOutbox } from './mailer-outbox.service';
