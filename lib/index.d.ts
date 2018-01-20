/** Dependencies **/
import { DynamicModule } from '@nestjs/common';
import { SendMailOptions, SentMessageInfo } from 'nodemailer';

declare class MailerModule {
    static forRoot(transport?: any, defaults?: any): DynamicModule;
}

declare class MailerProvider {
    public sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo>;
}