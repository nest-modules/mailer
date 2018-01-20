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

  static forRoot(transport?: any, defaults?: any): DynamicModule {
    const MailerConfig: CustomValue = {
      name: 'MAILER_CONFIG',
      provide: 'MAILER_CONFIG',
      useValue: {
        transport: transport,
        defaults: defaults,
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
