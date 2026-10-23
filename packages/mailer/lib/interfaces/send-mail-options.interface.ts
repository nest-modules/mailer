import { Type } from '@nestjs/common';
import { SendMailOptions } from 'nodemailer';
import * as DKIM from 'nodemailer/lib/dkim';
import { Attachment } from 'nodemailer/lib/mailer';
import { MailerRetryOptions } from './retry-options.interface';

export type TextEncoding = 'quoted-printable' | 'base64';
export type Headers =
  | { [key: string]: string | string[] | { prepared: boolean; value: string } }
  | Array<{ key: string; value: string }>;

export interface Address {
  name: string;
  address: string;
}

export interface AttachmentLikeObject {
  path: string;
}

/** DSN (Delivery Status Notification) options */
export interface DsnOptions {
  /** Return headers only (HDRS) or full message (FULL) */
  ret?: 'FULL' | 'HDRS';
  /** Sender's envelope id for tracking */
  envid?: string;
  /** Notification conditions */
  notify?: Array<'NEVER' | 'SUCCESS' | 'FAILURE' | 'DELAY'>;
  /** Original recipient address */
  orcpt?: string;
}

/** iCalendar event options for calendar invitations */
export interface ICalOptions {
  /** iCal event filename (default: 'invite.ics') */
  filename?: string;
  /** iCal method: REQUEST, CANCEL, REPLY, etc. */
  method?: string;
  /** iCal content string (VCALENDAR format) */
  content?: string | Buffer;
  /** Path to .ics file */
  path?: string;
  /** Content encoding (e.g., 'base64') */
  encoding?: string;
}

/** One-click unsubscribe (RFC 8058), required by Gmail and Yahoo for bulk senders */
export interface UnsubscribeOptions {
  /** HTTPS endpoint that unsubscribes the recipient when it receives a POST */
  url?: string;
  /** Address that unsubscribes the sender of a message sent to it */
  mailto?: string;
  /**
   * Adds `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, so mailbox providers
   * show an unsubscribe button. Default: `true` when `url` is set.
   */
  oneClick?: boolean;
}

/** Fields redeclared below; omitted so the base type may differ per nodemailer major */
type OverriddenFields =
  | 'to'
  | 'cc'
  | 'bcc'
  | 'replyTo'
  | 'inReplyTo'
  | 'from'
  | 'subject'
  | 'text'
  | 'html'
  | 'sender'
  | 'raw'
  | 'textEncoding'
  | 'references'
  | 'encoding'
  | 'date'
  | 'headers'
  | 'attachments'
  | 'dkim';

export interface ISendMailOptions
  extends Omit<SendMailOptions, OverriddenFields> {
  to?: string | Address | Array<string | Address>;
  cc?: string | Address | Array<string | Address>;
  bcc?: string | Address | Array<string | Address>;
  replyTo?: string | Address | Array<string | Address>;
  inReplyTo?: string | Address;
  from?: string | Address;
  subject?: string;
  text?: string | Buffer | AttachmentLikeObject;
  /** A string, a Buffer, or `SafeHtml` from the `html` tag */
  html?: string | Buffer | { toString(): string };
  sender?: string | Address;
  raw?: string | Buffer;
  textEncoding?: TextEncoding;
  references?: string | string[];
  encoding?: string;
  date?: Date | string;
  headers?: Headers;
  context?: {
    [name: string]: any;
  };
  transporterName?: string;
  template?: string;
  /** Locale for i18n template resolution (e.g., 'es', 'fr') */
  locale?: string;
  /** Path to a plain text template for multipart/alternative emails */
  textTemplate?: string;
  attachments?: Attachment[];
  dkim?: DKIM.Options;
  /** DSN (Delivery Status Notification) options */
  dsn?: DsnOptions;
  /** iCalendar event for calendar invitations */
  icalEvent?: ICalOptions;
  /** Send timeout in milliseconds (overrides global sendTimeout) */
  timeout?: number;
  /** Overrides the module's `retry` for this send */
  retry?: number | false | MailerRetryOptions;
  /**
   * Aborts the send, including the wait between retries. A message already
   * handed to the server may still be delivered.
   */
  signal?: AbortSignal;
  /**
   * Identifies this email across redeliveries (an order id, an outbox message id).
   * The `Message-ID` is derived from it, so a redelivered email carries the same
   * one and mailbox providers can drop the duplicate.
   */
  idempotencyKey?: string;
  /**
   * Named transporters to try, in order, when the selected one fails.
   * Overrides the module's `failover`; `false` disables it for this send.
   */
  failover?: string[] | false;
  /** Adds `List-Unsubscribe` headers (with one-click support) */
  unsubscribe?: UnsubscribeOptions;
  /** @internal Set by `send(MailClass)`: the mail class that rendered the email */
  mailable?: Type<unknown>;
}
