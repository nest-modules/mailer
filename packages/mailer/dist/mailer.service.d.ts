import { SentMessageInfo } from 'nodemailer';
import { MailerOptions, TransportType } from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
export declare class MailerService {
    private readonly mailerOptions;
    private readonly transportFactory;
    private transporter;
    private transporters;
    private templateAdapter;
    private initTemplateAdapter;
    private readonly mailerLogger;
    constructor(mailerOptions: MailerOptions, transportFactory: IMailerTransportFactory);
    private validateTransportOptions;
    private createTransporter;
    private setupTransporters;
    private verifyTransporter;
    verifyAllTransporters(): Promise<boolean>;
    sendMail(sendMailOptions: ISendMailOptions): Promise<SentMessageInfo>;
    addTransporter(transporterName: string, config: TransportType): string;
}
