import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  to?: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: [{ filename?: string, path?: string, content: string | Buffer }];
  template?: string,
  context?: { [name: string]: any; }
  
}
