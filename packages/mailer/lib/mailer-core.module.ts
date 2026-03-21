/** Dependencies **/

import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ValueProvider } from '@nestjs/common/interfaces';

/** Constants **/
import { MAILER_OPTIONS } from './constants/mailer.constant';
/** Health **/
import { MailerHealthIndicator } from './health/mailer.health-indicator';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';
/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
import { MailerService } from './mailer.service';
/** Services **/
import { MailerBatchService } from './mailer-batch.service';
import { MailerEventService } from './mailer-event.service';

@Global()
@Module({})
export class MailerCoreModule {
  public static forRoot(options: MailerOptions): DynamicModule {
    const MailerOptionsProvider: ValueProvider<MailerOptions> = {
      provide: MAILER_OPTIONS,
      useValue: options,
    };

    return {
      module: MailerCoreModule,
      providers: [
        /** Options **/
        MailerOptionsProvider,

        /** Services **/
        MailerEventService,
        MailerService,
        MailerBatchService,
        MailerHealthIndicator,
      ],
      exports: [
        /** Services **/
        MailerService,
        MailerBatchService,
        MailerEventService,
        MailerHealthIndicator,
      ],
    };
  }

  public static forRootAsync(options: MailerAsyncOptions): DynamicModule {
    const providers: Provider[] =
      MailerCoreModule.createAsyncProviders(options);

    return {
      module: MailerCoreModule,
      providers: [
        /** Providers **/
        ...providers,

        /** Services **/
        MailerEventService,
        MailerService,
        MailerBatchService,
        MailerHealthIndicator,

        /** Extra providers **/
        ...(options.extraProviders || []),
      ],
      imports: options.imports,
      exports: [
        /** Services **/
        MailerService,
        MailerBatchService,
        MailerEventService,
        MailerHealthIndicator,
      ],
    };
  }

  private static createAsyncProviders(options: MailerAsyncOptions): Provider[] {
    const providers: Provider[] = [
      MailerCoreModule.createAsyncOptionsProvider(options),
    ];

    if (options.useClass) {
      providers.push({
        provide: options.useClass,
        useClass: options.useClass,
      });
    }

    return providers;
  }

  private static createAsyncOptionsProvider(
    options: MailerAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        name: MAILER_OPTIONS,
        provide: MAILER_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    return {
      name: MAILER_OPTIONS,
      provide: MAILER_OPTIONS,
      useFactory: async (optionsFactory: MailerOptionsFactory) => {
        return optionsFactory.createMailerOptions();
      },
      inject: [options.useExisting! || options.useClass!],
    };
  }
}
