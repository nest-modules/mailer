import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  to?: string;
  cc?: string[];
  from?: string;
  replyTo?: string;
  subject?: string;
  text?: string;
  html?: string;
  template?: string;
  context?: {
    [name: string]: any;
  };
  transporterName?: string;
  attachments?: {
    filename: string;
    contents?: any;
    path?: string;
    contentType?: string;
    cid: string;
  }[];
}
