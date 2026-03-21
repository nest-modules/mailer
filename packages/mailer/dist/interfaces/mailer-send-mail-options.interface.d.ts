import { SendMailOptions } from 'nodemailer';
export interface MailerSendMailOptions extends SendMailOptions {
    template?: string;
    context?: any;
}
