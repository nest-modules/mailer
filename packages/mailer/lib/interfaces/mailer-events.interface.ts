import { ISendMailOptions } from './send-mail-options.interface';

/**
 * Mailer event names.
 */
export enum MailerEvent {
  BEFORE_SEND = 'mailer.before_send',
  AFTER_SEND = 'mailer.after_send',
  SEND_ERROR = 'mailer.send_error',
  /** A transient failure is about to be retried */
  RETRY = 'mailer.retry',
  /** The selected transporter failed and the next one in `failover` is tried */
  FAILOVER = 'mailer.failover',
  /** Recipients were dropped by `suppress`; `suppressed` lists them */
  SUPPRESSED = 'mailer.suppressed',
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
  /** The error (only on SEND_ERROR / RETRY / FAILOVER / QUEUE_FAILED) */
  error?: Error;
  /** Timestamp of the event */
  timestamp: Date;
  /** The attempt that just finished, 1 for the first (AFTER_SEND / SEND_ERROR / RETRY) */
  attempt?: number;
  /** Whether the error can't be fixed by retrying (SEND_ERROR) */
  permanent?: boolean;
  /** The named transporter involved, when it isn't the default one */
  transporterName?: string;
  /** How long the send took, retries included (AFTER_SEND / SEND_ERROR) */
  durationMs?: number;
  /** The addresses `suppress` dropped (SUPPRESSED) */
  suppressed?: string[];
}

/** An event as `MailerEventService.events$` emits it */
export interface MailerEventRecord extends MailerEventPayload {
  event: MailerEvent;
}
