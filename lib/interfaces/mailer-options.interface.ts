/** Interfaces **/
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import { TemplateAdapter } from './template-adapter.interface';

export interface MailerOptions {
  defaults?: SMTPTransport.Options;
  transport?: SMTPTransport | SMTPTransport.Options | string;
  template?: {
    dir?: string;
    adapter?: TemplateAdapter;
    options?: { [name: string]: any; };
  };
}
