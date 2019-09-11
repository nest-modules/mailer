import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  to?: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: { [{filename: string, path: string}]}
  template?: string,
  context?: { [name: string]: any; }
  
}
