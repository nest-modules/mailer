import { ISendMailOptions } from './send-mail-options.interface';

/**
 * Mailer event names.
 */
export enum MailerEvent {
  BEFORE_SEND = 'mailer.before_send',
  AFTER_SEND = 'mailer.after_send',
  SEND_ERROR = 'mailer.send_error',
  QUEUED = 'mailer.queued',
  QUEUE_COMPLETED = 'mailer.queue.completed',
  QUEUE_FAILED = 'mailer.queue.failed',
}

/**
 * Payload emitted with mailer events.
 */
export interface MailerEventPayload {
  /** The mail options used for sending */
  mailOptions: ISendMailOptions;
  /** The result from nodemailer (only on AFTER_SEND / QUEUE_COMPLETED) */
  result?: any;
  /** The error (only on SEND_ERROR / QUEUE_FAILED) */
  error?: Error;
  /** Timestamp of the event */
  timestamp: Date;
}
