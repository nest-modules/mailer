import { DynamicModule, Module } from '@nestjs/common';
import { MailerCoreModule } from './mailer-core.module';
import { 
  MailerModuleOptions, 
  MailerModuleAsyncOptions 
} from './interfaces';

@Module({})
export class MailerModule {
  static forRoot(options?: MailerModuleOptions): DynamicModule {
    return {
      module: MailerModule,
      modules: [MailerCoreModule.forRoot(options)],
    };
  }

  static forRootAsync(options: MailerModuleAsyncOptions): DynamicModule {
    return {
      module: MailerModule,
      imports: [MailerCoreModule.forRootAsync(options)],
    };
  }

}
