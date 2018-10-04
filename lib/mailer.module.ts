/** Dependencies **/
import { DynamicModule, Module } from '@nestjs/common';

/** Modules **/
import { MailerCoreModule } from './mailer-core.module';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class MailerModule {
  static forRoot(config?: any): DynamicModule {
    return {
      module: MailerModule,
      modules: [MailerCoreModule.forRoot(config)],
    };
  }
}
