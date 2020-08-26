/** Modules **/
export { MailerModule } from './mailer.module';

/** Constants **/
export {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';

/** Interfaces **/
export { MailerOptions } from './interfaces/mailer-options.interface';
export { TemplateAdapter } from './interfaces/template-adapter.interface';
export { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
export { ISendMailOptions } from './interfaces/send-mail-options.interface';
export { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';

/** Services **/
export { MailerService } from './mailer.service';
