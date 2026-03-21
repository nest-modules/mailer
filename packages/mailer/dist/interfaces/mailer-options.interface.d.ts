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
type Options = SMTPTransport.Options | SMTPPool.Options | SendmailTransport.Options | StreamTransport.Options | JSONTransport.Options | SESTransport.Options | TransportOptions;
export type TransportType = Options | SMTPTransport | SMTPPool | SendmailTransport | StreamTransport | JSONTransport | SESTransport | Transport | string;
export interface MailerPlugin {
    step: 'compile' | 'stream';
    plugin: (mail: any, callback: (err?: Error | null) => void) => void;
}
export interface RateLimitOptions {
    maxMessages: number;
    period?: number;
}
export interface MailerOptions {
    defaults?: Options;
    transport?: TransportType;
    transports?: {
        [name: string]: TransportType;
    };
    template?: {
        dir?: string;
        dirs?: string[];
        adapter?: TemplateAdapter;
        options?: {
            [name: string]: any;
        };
        resolver?: TemplateResolver;
    };
    i18n?: I18nOptions;
    options?: {
        [name: string]: any;
    };
    preview?: boolean | Partial<{
        dir: string;
        open: boolean | {
            wait: boolean;
            app: string | string[];
        };
    }>;
    verifyTransporters?: boolean;
    plugins?: MailerPlugin[];
    sendTimeout?: number;
    rateLimit?: RateLimitOptions;
}
export {};
