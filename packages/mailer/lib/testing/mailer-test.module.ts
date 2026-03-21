import { DynamicModule, Global, Module } from '@nestjs/common';
import { MAILER_OPTIONS } from '../constants/mailer.constant';
import { MailerService } from '../mailer.service';
import { MailerBatchService } from '../mailer-batch.service';
import { MailerEventService } from '../mailer-event.service';

/**
 * A test module that creates a MailerService with a streamTransport
 * so emails are not actually sent. Useful for unit and integration tests.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [MailerTestModule.register()],
 * }).compile();
 *
 * const mailerService = module.get(MailerService);
 * ```
 */
@Global()
@Module({})
export class MailerTestModule {
  static register(
    options?: Partial<{
      template: { dir?: string; adapter?: any; options?: any };
    }>,
  ): DynamicModule {
    return {
      module: MailerTestModule,
      providers: [
        {
          provide: MAILER_OPTIONS,
          useValue: {
            transport: {
              streamTransport: true,
              newline: 'unix',
              buffer: true,
            },
            ...options,
          },
        },
        MailerEventService,
        MailerService,
        MailerBatchService,
      ],
      exports: [MailerService, MailerBatchService, MailerEventService],
    };
  }
}
