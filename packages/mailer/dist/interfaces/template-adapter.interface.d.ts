import { MailerOptions } from './mailer-options.interface';
export interface TemplateAdapter {
    compile(mail: any, callback: (err?: any, body?: string) => any, options: MailerOptions): void;
}
