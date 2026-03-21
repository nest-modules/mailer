import { DynamicModule, Module, Provider } from '@nestjs/common';
import { MAILER_QUEUE_OPTIONS } from './constants/mailer.constant';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerQueueProcessor } from './mailer-queue.processor';
import { MailerQueueService } from './mailer-queue.service';

/**
 * Optional module for email queueing with BullMQ.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     MailerModule.forRoot({ ... }),
 *     MailerQueueModule.register({
 *       connection: { host: 'localhost', port: 6379 },
 *       defaultJobOptions: {
 *         attempts: 3,
 *         backoff: { type: 'exponential', delay: 1000 },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
@Module({})
export class MailerQueueModule {
  static register(options: MailerQueueOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: MAILER_QUEUE_OPTIONS,
      useValue: options,
    };

    return {
      module: MailerQueueModule,
      providers: [optionsProvider, MailerQueueService, MailerQueueProcessor],
      exports: [MailerQueueService],
    };
  }

  static registerAsync(options: {
    imports?: any[];
    inject?: any[];
    useFactory: (
      ...args: any[]
    ) => Promise<MailerQueueOptions> | MailerQueueOptions;
  }): DynamicModule {
    const optionsProvider: Provider = {
      provide: MAILER_QUEUE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: MailerQueueModule,
      imports: options.imports || [],
      providers: [optionsProvider, MailerQueueService, MailerQueueProcessor],
      exports: [MailerQueueService],
    };
  }
}
