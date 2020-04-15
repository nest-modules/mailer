/** Modules **/
export { MailerModule } from './mailer.module';

/** Adapters **/
export { PugAdapter } from './adapters/pug.adapter';
export { HandlebarsAdapter } from './adapters/handlebars.adapter';
export { EjsAdapter } from './adapters/ejs.adapter';

/** Interfaces **/
export { MailerOptions } from './interfaces/mailer-options.interface';
export { TemplateAdapter } from './interfaces/template-adapter.interface';
export { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
export { ISendMailOptions } from './interfaces/send-mail-options.interface';

/** Services **/
export { MailerService } from './mailer.service';
