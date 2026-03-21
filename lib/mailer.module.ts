/** Dependencies **/
import { DynamicModule, Module } from '@nestjs/common';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
/** Modules **/
import { MailerCoreModule } from './mailer-core.module';

@Module({})
export class MailerModule {
  public static forRoot(options?: MailerOptions): DynamicModule {
    return {
      module: MailerModule,
      imports: [
        /** Modules **/
        MailerCoreModule.forRoot(options!),
      ],
    };
  }

  public static forRootAsync(options: MailerAsyncOptions): DynamicModule {
    return {
      module: MailerModule,
      imports: [
        /** Modules **/
        MailerCoreModule.forRootAsync(options),
      ],
    };
  }
}
