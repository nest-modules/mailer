/** Interfaces **/
import { SendMailOptions, Transport, TransportOptions } from 'nodemailer';
import * as JSONTransport from 'nodemailer/lib/json-transport';
import * as SendmailTransport from 'nodemailer/lib/sendmail-transport';
import * as SESTransport from 'nodemailer/lib/ses-transport';
import * as SMTPPool from 'nodemailer/lib/smtp-pool';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as StreamTransport from 'nodemailer/lib/stream-transport';

import { I18nOptions } from './i18n-options.interface';
import { MailerRetryOptions } from './retry-options.interface';
import { ISendMailOptions } from './send-mail-options.interface';
import { TemplateAdapter } from './template-adapter.interface';
import { TemplateResolver } from './template-resolver.interface';

type Options =
  | SMTPTransport.Options
  | SMTPPool.Options
  | SendmailTransport.Options
  | StreamTransport.Options
  | JSONTransport.Options
  | SESTransport.Options
  | TransportOptions;

/**
 * Instance type of a nodemailer transport module. Works with both the
 * `export =` layout of `@types/nodemailer` and the `export default` layout of
 * the types bundled with nodemailer >= 10.
 */
type TransportInstance<M> = M extends {
  default: abstract new (...args: any[]) => infer I;
}
  ? I
  : M extends abstract new (
        ...args: any[]
      ) => infer I
    ? I
    : never;

export type TransportType =
  | Options
  | TransportInstance<typeof SMTPTransport>
  | TransportInstance<typeof SMTPPool>
  | TransportInstance<typeof SendmailTransport>
  | TransportInstance<typeof StreamTransport>
  | TransportInstance<typeof JSONTransport>
  | TransportInstance<typeof SESTransport>
  | Transport
  | string;

/** Nodemailer plugin definition */
export interface MailerPlugin {
  /** The step at which the plugin runs: 'compile' or 'stream' */
  step: 'compile' | 'stream';
  /** The plugin function */
  plugin: (mail: any, callback: (err?: Error | null) => void) => void;
}

/** Rate limiting options */
export interface RateLimitOptions {
  /** Max number of messages per period */
  maxMessages: number;
  /** Period in milliseconds (default: 1000 = 1 second) */
  period?: number;
}

/**
 * Redirects email meant for real people to a safe inbox, for staging and QA.
 * Recipients matching `allow` are kept; every other recipient is removed and
 * `to` is replaced by the intercept address.
 */
export interface InterceptOptions {
  /** Where intercepted email goes */
  to: string | string[];
  /**
   * Recipients that are delivered normally: exact addresses, domains written
   * as `@example.com`, or regular expressions.
   */
  allow?: Array<string | RegExp>;
  /** Prepended to the subject of intercepted email, such as `[STAGING] ` */
  subjectPrefix?: string;
  /** Default: `true`. Set it from configuration to turn interception off. */
  enabled?: boolean;
}

export interface MailerOptions {
  defaults?: Options | SendMailOptions;
  transport?: TransportType;
  transports?: {
    [name: string]: TransportType;
  };
  template?: {
    dir?: string;
    /** Additional template directories to search */
    dirs?: string[];
    adapter?: TemplateAdapter;
    options?: { [name: string]: any };
    /** Custom template resolver for loading templates from DB, S3, etc. */
    resolver?: TemplateResolver;
  };
  /** Internationalization options for locale-aware templates */
  i18n?: I18nOptions;
  options?: { [name: string]: any };
  preview?:
    | boolean
    | Partial<{
        /**
         * a path to a directory for saving the generated email previews
         * (defaults to os.tmpdir() from os)
         *
         * @see https://nodejs.org/api/os.html#os_os_tmpdir
         * @type {string}
         */
        dir: string;
        /**
         * an options object that is passed to `open` (defaults to { wait: false })
         *
         * @see https://github.com/sindresorhus/open#options
         * @type {(boolean | { wait?: boolean; app?: string | string[] })}
         */
        open: boolean | { wait?: boolean; app?: string | string[] };
      }>;
  verifyTransporters?: boolean;
  /** Nodemailer plugins to register on all transporters */
  plugins?: MailerPlugin[];
  /** Global send timeout in milliseconds */
  sendTimeout?: number;
  /** Rate limiting options for email sending */
  rateLimit?: RateLimitOptions;
  /**
   * Retries transient failures with exponential backoff and jitter.
   * Default: 3 attempts, starting at 1s and doubling up to 30s, with full jitter.
   * `false` sends once.
   * @example retry: 3
   * @example retry: { attempts: 5, backoff: { delay: 500 } }
   */
  retry?: number | false | MailerRetryOptions;
  /**
   * Named transporters (from `transports`) to try, in order, when the selected
   * transporter fails with an error another transporter could avoid.
   */
  failover?: string[];
  /**
   * Adds a plain-text part derived from the HTML when an email has none.
   * Default: `true`.
   */
  textFromHtml?: boolean;
  /**
   * Throws typed errors (`MailerSmtpError`, `MailerTimeoutError`, …, all
   * `MailerError`) that keep nodemailer's fields and the original as `cause`.
   * `false` rethrows what the transport threw. Default: `true`.
   */
  wrapErrors?: boolean;
  /**
   * Rejects malformed addresses and line breaks in addresses, the subject or
   * headers before sending (`MailerMessageError`). Default: `true`.
   */
  validate?: boolean;
  /**
   * How long shutdown waits for the sends in flight before closing the
   * transporters, in milliseconds. Default: `30000`.
   */
  shutdownTimeout?: number;
  /** Redirects recipients to a safe inbox (staging, QA) */
  intercept?: InterceptOptions;
  /**
   * Called for every recipient; return `true` to drop it (bounces, complaints,
   * unsubscribed users). An email with no recipients left is not sent.
   */
  suppress?: (
    address: string,
    mail: ISendMailOptions,
  ) => boolean | Promise<boolean>;
}
