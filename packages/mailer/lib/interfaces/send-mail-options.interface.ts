import { SendMailOptions } from 'nodemailer';
import * as DKIM from 'nodemailer/lib/dkim';
import { Attachment } from 'nodemailer/lib/mailer';

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

export interface ISendMailOptions extends SendMailOptions {
  to?: string | Address | Array<string | Address>;
  cc?: string | Address | Array<string | Address>;
  bcc?: string | Address | Array<string | Address>;
  replyTo?: string | Address | Array<string | Address>;
  inReplyTo?: string | Address;
  from?: string | Address;
  subject?: string;
  text?: string | Buffer | AttachmentLikeObject;
  html?: string | Buffer;
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
}
