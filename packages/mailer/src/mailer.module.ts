/** Dependencies **/
import { DynamicModule, Module } from '@nestjs/common';

/** Modules **/
import { MailerCoreModule } from './mailer-core.module';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';

/**
 * @class MailerModule
 * @description Provides methods for configuring the MailerModule
 */
@Module({})
export class MailerModule {
  /**
   * @method forRoot
   * @description Configures the MailerModule with synchronous options
   * @param {MailerOptions} options - The options for configuring the MailerModule
   * @returns {DynamicModule} - The configured MailerModule
   */
  public static forRoot(options?: MailerOptions): DynamicModule {
    return {
      module: MailerModule,
      imports: [
        /** Modules **/
        MailerCoreModule.forRoot(options!),
      ],
    };
  }

  /**
   * @method forRootAsync
   * @description Configures the MailerModule with asynchronous options
   * @param {MailerAsyncOptions} options - The options for configuring the MailerModule
   * @returns {DynamicModule} - The configured MailerModule
   */
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
