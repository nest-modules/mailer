/** Dependencies **/
import { CustomValue } from '@nestjs/core/injector/module';
import { DynamicModule, Module, Global } from '@nestjs/common';

/** Providers **/
import { MailerProvider } from './mailer.provider';

@Global()
@Module({
  imports: [],
  controllers: [],
  components: [],
  exports: [],
})
export class MailerCoreModule {

  static forRoot(config?: any): DynamicModule {
    const MailerConfig: CustomValue = {
      name: 'MAILER_CONFIG',
      provide: 'MAILER_CONFIG',
      useValue: {
        transport: config.transport,
        defaults: config.defaults,
        templateDir: config.templateDir
      },
    };

    return {
      module: MailerCoreModule,
      components: [
        MailerProvider,
        MailerConfig,
      ],
      exports: [
        MailerProvider,
      ],
    };
  }

}
