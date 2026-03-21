/** Modules **/
export { MailerModule } from './mailer.module';
export { MailerQueueModule } from './mailer-queue.module';

/** Constants **/
export {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
  MAILER_TEMPLATE_RESOLVER,
  MAILER_QUEUE_OPTIONS,
} from './constants/mailer.constant';

/** Interfaces **/
export { MailerOptions } from './interfaces/mailer-options.interface';
export { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
export { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
export { ISendMailOptions } from './interfaces/send-mail-options.interface';
export { TemplateAdapter } from './interfaces/template-adapter.interface';
export { TemplateAdapterConfig } from './interfaces/template-adapter-config.interface';
export {
  TemplateResolver,
  ResolvedTemplate,
} from './interfaces/template-resolver.interface';
export { I18nOptions } from './interfaces/i18n-options.interface';
export {
  MailerEvent,
  MailerEventPayload,
} from './interfaces/mailer-events.interface';
export {
  BatchMailOptions,
  BatchResult,
  BatchItemResult,
} from './interfaces/batch-options.interface';
export { MailerQueueOptions } from './interfaces/queue-options.interface';

/** Services **/
export { MailerService } from './mailer.service';
export { MailerBatchService } from './mailer-batch.service';
export { MailerEventService } from './mailer-event.service';
export { MailerQueueService } from './mailer-queue.service';

/** Health **/
export { MailerHealthIndicator } from './health/mailer.health-indicator';
