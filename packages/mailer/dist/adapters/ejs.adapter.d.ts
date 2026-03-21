import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
export declare class EjsAdapter implements TemplateAdapter {
    private precompiledTemplates;
    private config;
    constructor(config?: TemplateAdapterConfig);
    compile(mail: any, callback: any, mailerOptions: MailerOptions): void;
}
