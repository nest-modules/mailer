/** Interfaces **/
import { Transport, TransportOptions } from 'nodemailer';
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as SMTPPool from 'nodemailer/lib/smtp-pool';
import * as SendmailTransport from 'nodemailer/lib/sendmail-transport';
import * as StreamTransport from 'nodemailer/lib/stream-transport';
import * as JSONTransport from 'nodemailer/lib/json-transport';
import * as SESTransport from 'nodemailer/lib/ses-transport';

import { TemplateAdapter } from './template-adapter.interface';

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
    [name: string]: SMTPTransport | SMTPTransport.Options | string;
  };
  template?: {
    dir?: string;
    adapter?: TemplateAdapter;
    options?: { [name: string]: any };
  };
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
