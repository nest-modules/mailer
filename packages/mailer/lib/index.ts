/** Modules **/

/** Constants **/
export {
  MAILER_EVENT_EMITTER,
  MAILER_OPTIONS,
  MAILER_QUEUE_OPTIONS,
  MAILER_TEMPLATE_RESOLVER,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';
/** Errors **/
export {
  MailerConnectionError,
  MailerError,
  MailerMessageError,
  MailerProviderError,
  MailerRecipientsRejectedError,
  MailerSmtpError,
  MailerTemplateError,
  MailerTimeoutError,
  toMailerError,
} from './errors';
/** Health **/
export { MailerHealthIndicator } from './health/mailer.health-indicator';
export {
  BatchItemResult,
  BatchMailOptions,
  BatchResult,
} from './interfaces/batch-options.interface';
export { I18nOptions } from './interfaces/i18n-options.interface';
export {
  Mailable,
  MailableContent,
  MailableContext,
  MailableData,
  MailableSendOptions,
  RenderedMail,
} from './interfaces/mailable.interface';
export {
  MailerEvent,
  MailerEventPayload,
  MailerEventRecord,
} from './interfaces/mailer-events.interface';
/** Interfaces **/
export {
  InterceptOptions,
  MailerOptions,
  MailerPlugin,
  RateLimitOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
export { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
export { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
export { MailerQueueOptions } from './interfaces/queue-options.interface';
export { MailerRetryOptions } from './interfaces/retry-options.interface';
export {
  DsnOptions,
  ICalOptions,
  ISendMailOptions,
  UnsubscribeOptions,
} from './interfaces/send-mail-options.interface';
export { TemplateAdapter } from './interfaces/template-adapter.interface';
export { TemplateAdapterConfig } from './interfaces/template-adapter-config.interface';
export {
  ResolvedTemplate,
  TemplateResolver,
} from './interfaces/template-resolver.interface';
export { MailerModule } from './mailer.module';
/** Services **/
export { MailerService, SuppressedMessageInfo } from './mailer.service';
export { MailerBatchService } from './mailer-batch.service';
export {
  MailerEventEmitter,
  MailerEventService,
  mailerChannelName,
} from './mailer-event.service';
export { MailerQueueModule } from './mailer-queue.module';
export { MailerQueueService } from './mailer-queue.service';
/** Development **/
export {
  MAILER_PREVIEW_OPTIONS,
  MailerPreview,
  MailerPreviewModule,
  MailerPreviewOptions,
} from './preview/mailer-preview.module';
/** Testing **/
export { MailerTestModule } from './testing/mailer-test.module';
/** Transports **/
export { CapturedMail, LOCAL_TRANSPORT } from './transports/captured-mail';
export {
  FileTransport,
  FileTransportOptions,
} from './transports/file.transport';
export {
  AwsCredentials,
  BrevoTransport,
  BrevoTransportOptions,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  MailgunTransport,
  MailgunTransportOptions,
  PostmarkTransport,
  PostmarkTransportOptions,
  parseRetryAfter,
  ResendTransport,
  ResendTransportOptions,
  SendGridTransport,
  SendGridTransportOptions,
  SesTransport,
  SesTransportOptions,
  SigV4Options,
  SigV4Request,
  SigV4Signature,
  signV4,
} from './transports/http';
export { LogTransport, LogTransportOptions } from './transports/log.transport';
export { MailQuery, TestMailbox } from './transports/test-mailbox';
/** Utilities **/
export { htmlToText } from './utils/html-to-text';
export { isTransientError, mayHaveBeenDelivered } from './utils/retry';
export { html, isSafeHtml, SafeHtml, unsafeHtml } from './utils/safe-html';
export { validateMessage } from './utils/validate-message';
