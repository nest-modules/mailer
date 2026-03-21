/** Interfaces **/
import { Transport, TransportOptions } from 'nodemailer';
import * as JSONTransport from 'nodemailer/lib/json-transport';
import * as SendmailTransport from 'nodemailer/lib/sendmail-transport';
import * as SESTransport from 'nodemailer/lib/ses-transport';
import * as SMTPPool from 'nodemailer/lib/smtp-pool';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as StreamTransport from 'nodemailer/lib/stream-transport';

import { I18nOptions } from './i18n-options.interface';
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

export type TransportType =
  | Options
  | SMTPTransport
  | SMTPPool
  | SendmailTransport
  | StreamTransport
  | JSONTransport
  | SESTransport
  | Transport
  | string;

export interface MailerOptions {
  defaults?: Options;
  transport?: TransportType;
  transports?: {
    [name: string]: TransportType;
  };
  template?: {
    dir?: string;
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
         * @type {(boolean | { wait: boolean; app: string | string[] })}
         */
        open: boolean | { wait: boolean; app: string | string[] };
      }>;
  verifyTransporters?: boolean;
}
