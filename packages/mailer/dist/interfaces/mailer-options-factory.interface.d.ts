import { MailerOptions } from './mailer-options.interface';
export interface MailerOptionsFactory {
    createMailerOptions(): Promise<MailerOptions> | MailerOptions;
}
