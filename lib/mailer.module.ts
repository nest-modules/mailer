/** Dependencies **/
import { DynamicModule, Module } from '@nestjs/common';

/** Modules **/
import { MailerCoreModule } from './mailer-core.module';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';

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
