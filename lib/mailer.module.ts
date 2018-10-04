import { DynamicModule, Module } from '@nestjs/common';
import { MailerCoreModule } from './mailer-core.module';
import { MailerModuleOptions } from './interfaces';

@Module({})
export class MailerModule {
  static forRoot(options?: MailerModuleOptions): DynamicModule {
    return {
      module: MailerModule,
      modules: [MailerCoreModule.forRoot(options)],
    };
  }
}
