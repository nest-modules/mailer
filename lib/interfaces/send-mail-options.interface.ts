import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  context?: {
    [name: string]: any;
  };
  transporterName?: string;
  template?: string;
  attachments?: {
    filename: string;
    contents?: any;
    path?: string;
    contentType?: string;
    cid: string;
  }[];
}
