import * as Mail from 'nodemailer/lib/mailer';
import { MailerOptions, TransportType } from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
export declare class MailerTransportFactory implements IMailerTransportFactory {
    private readonly options;
    constructor(options: MailerOptions);
    createTransport(opts?: TransportType): Mail;
}
