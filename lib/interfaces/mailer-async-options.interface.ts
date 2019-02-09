/** Dependencies **/
import { ModuleMetadata, Type } from '@nestjs/common/interfaces';

/** Interfaces **/
import { MailerOptions } from './mailer-options.interface';
import { MailerOptionsFactory } from './mailer-options-factory.interface';

export interface MailerAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: any[];
  useClass?: Type<MailerOptionsFactory>;
  useExisting?: Type<MailerOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<MailerOptions> | MailerOptions;
}
