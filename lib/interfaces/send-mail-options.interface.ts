import { SendMailOptions } from 'nodemailer';

export interface ISendMailOptions extends SendMailOptions {
  to?: string;
    cc?:string[];
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    template?: string;
    context?: {
        [name: string]: any;
    };
    attachments?: {
        filename: string,
        contents?: any,
        path?: string,
        contentType?: string
        cid: string
    }[]
}

 
