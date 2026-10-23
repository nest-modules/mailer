/** Injection token of the resolved `MailerOutboxModule` options */
export const MAILER_OUTBOX_OPTIONS = 'MAILER_OUTBOX_OPTIONS';

/** The outbox topic emails are recorded under by default */
export const DEFAULT_MAILER_OUTBOX_TOPIC = 'mailer.send';

/** The inbox identity of the handler that sends them by default */
export const DEFAULT_MAILER_OUTBOX_CONSUMER = 'mailer';

/** Version of the payload format, so a future one can tell old messages apart */
export const MAILER_OUTBOX_PAYLOAD_VERSION = 1;
