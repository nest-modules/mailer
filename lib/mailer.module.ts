/** Dependencies **/
import { DynamicModule, Module } from '@nestjs/common';

/** Modules **/
import { MailerCoreModule } from './mailer-core.module';

@Module({
  imports: [],
  controllers: [],
  components: [],
  exports: [],
})
export class MailerModule {

  static forRoot(transport?: any, defaults?: any): DynamicModule {
    return {
      module: MailerModule,
      modules: [
        MailerCoreModule.forRoot(transport, defaults),
      ],
    };
  }

}
