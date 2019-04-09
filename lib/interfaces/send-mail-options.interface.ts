import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  to?: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  template?: string,
  context?: { [name: string]: any; }
}