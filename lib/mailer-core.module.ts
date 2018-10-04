/** Dependencies **/
import { CustomValue } from '@nestjs/core/injector/module';
import { DynamicModule, Module, Global } from '@nestjs/common';

/** Providers **/
import { MailerProvider } from './mailer.provider';

/** Utils **/
import { ConfigRead } from './mailer.utils';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class MailerCoreModule {
  static forRoot(config: any): DynamicModule {
    config = ConfigRead(config);

    const MailerConfig: CustomValue = {
      name: 'MAILER_CONFIG',
      provide: 'MAILER_CONFIG',
      useValue: {
        transport: config.transport,
        defaults: config.defaults,
        templateDir: config.templateDir,
        templateOptions: config.templateOptions,
      },
    };

    return {
      module: MailerCoreModule,
      components: [MailerProvider, MailerConfig],
      exports: [MailerProvider],
    };
  }
}
