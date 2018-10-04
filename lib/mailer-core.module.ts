import { CustomValue } from '@nestjs/core/injector/module';
import {
  DynamicModule,
  Module,
  Global,
  Provider
} from '@nestjs/common';
import {
  MailerModuleOptions,
  MailerModuleAsyncOptions,
  MailerOptionsFactory
} from './interfaces';
import { MailerProvider } from './mailer.provider';
import { ConfigRead } from './mailer.utils';

@Global()
@Module({})
export class MailerCoreModule {
  static forRoot(options: MailerModuleOptions): DynamicModule {
    options = ConfigRead(options);

    const MailerOptions: CustomValue = {
      name: 'MAILER_MODULE_OPTIONS',
      provide: 'MAILER_MODULE_OPTIONS',
      useValue: {
        transport: options.transport,
        defaults: options.defaults,
        templateDir: options.templateDir,
        templateOptions: options.templateOptions,
      } as MailerModuleOptions,
    };

    return {
      module: MailerCoreModule,
      components: [MailerProvider, MailerOptions],
      exports: [MailerProvider],
    };
  }

  static forRootAsync(options: MailerModuleAsyncOptions): DynamicModule {

    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: MailerCoreModule,
      imports: options.imports,
      providers: [
        ...asyncProviders,
        MailerProvider
      ],
      exports: [MailerProvider],
    };
  }

  private static createAsyncProviders(
    options: MailerModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }
    return [
      this.createAsyncOptionsProvider(options),
      {
        provide: options.useClass,
        useClass: options.useClass,
      },
    ];
  }

  private static createAsyncOptionsProvider(
    options: MailerModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: 'MAILER_MODULE_OPTIONS',
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }
    return {
      provide: 'MAILER_MODULE_OPTIONS',
      useFactory: async (optionsFactory: MailerOptionsFactory) => optionsFactory.createMailerOptions(),
      inject: [options.useExisting || options.useClass],
    };
  }

}