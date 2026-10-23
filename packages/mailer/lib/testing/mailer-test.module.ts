import { DynamicModule, Global, Module } from '@nestjs/common';
import { MAILER_OPTIONS } from '../constants/mailer.constant';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { MailerService } from '../mailer.service';
import { MailerBatchService } from '../mailer-batch.service';
import { MailerEventService } from '../mailer-event.service';
import { TestMailbox } from '../transports/test-mailbox';

/**
 * A test module whose MailerService delivers to a `TestMailbox`, so emails
 * are captured in memory, with assertions, instead of being sent. Useful for
 * unit and integration tests.
 *
 * @example
 * ```typescript
 * const module = await Test.createTestingModule({
 *   imports: [MailerTestModule.register()],
 * }).compile();
 *
 * const mailbox = module.get(TestMailbox);
 * await module.get(MailerService).sendMail({ to: 'ada@example.com', subject: 'Hi' });
 * mailbox.assertSent({ to: 'ada@example.com', subject: 'Hi' });
 * ```
 */
@Global()
@Module({})
export class MailerTestModule {
  /**
   * @param options Mailer options for the test (templates, i18n, defaults, …).
   *   The transport is always the module's `TestMailbox`.
   */
  static register(
    options: Omit<MailerOptions, 'transport' | 'transports'> = {},
  ): DynamicModule {
    const mailbox = new TestMailbox();
    return {
      module: MailerTestModule,
      providers: [
        {
          provide: MAILER_OPTIONS,
          useValue: {
            // A simulated failure fails right away unless the test asks for retries
            retry: false,
            ...options,
            // The mailbox builds each message once, as a real transport would
            transport: mailbox,
          },
        },
        { provide: TestMailbox, useValue: mailbox },
        MailerEventService,
        MailerService,
        MailerBatchService,
      ],
      exports: [
        MailerService,
        MailerBatchService,
        MailerEventService,
        TestMailbox,
      ],
    };
  }
}
