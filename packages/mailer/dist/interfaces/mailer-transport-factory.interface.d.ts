import * as Mail from 'nodemailer/lib/mailer';
import { TransportType } from './mailer-options.interface';
export interface MailerTransportFactory {
    createTransport(opts?: TransportType): Mail;
}
