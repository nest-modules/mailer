import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  template?: string,
  context?: { [name: string]: any; }
}