import { CustomValue } from '@nestjs/core/injector/module';
import { DynamicModule, Module, Global } from '@nestjs/common';
import { MailerProvider } from './mailer.provider';
import { ConfigRead } from './mailer.utils';
import { MailerModuleOptions } from './interfaces';

@Global()
@Module({})
export class MailerCoreModule {
  static forRoot(options: MailerModuleOptions): DynamicModule {
    options = ConfigRead(options);

    const MailerOptions: CustomValue = {
      name: 'MAILER_MODULE_OPTIONS',
      provide: 'MAILER_MODULE_OPTIONS',
      useValue: {
        transport: options.transport,
        defaults: options.defaults,
        templateDir: options.templateDir,
        templateOptions: options.templateOptions,
      } as MailerModuleOptions,
    };

    return {
      module: MailerCoreModule,
      components: [MailerProvider, MailerOptions],
      exports: [MailerProvider],
    };
  }

}
