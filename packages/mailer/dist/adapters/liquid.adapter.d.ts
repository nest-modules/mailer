import { Liquid } from 'liquidjs';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
export declare class LiquidAdapter implements TemplateAdapter {
    private config;
    constructor(config?: Partial<Liquid['options']>);
    compile(mail: any, callback: any, mailerOptions: MailerOptions): void;
}
