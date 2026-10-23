import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { MAILER_QUEUE_OPTIONS } from './constants/mailer.constant';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerService } from './mailer.service';
import { MailerEventService } from './mailer-event.service';
import { isTransientError } from './utils/retry';

/**
 * BullMQ worker that processes queued emails.
 */
@Injectable()
export class MailerQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(MailerQueueProcessor.name);
  private worker: any;
  private UnrecoverableError?: new (
    message?: string,
  ) => Error;

  constructor(
    private readonly mailerService: MailerService,
    @Inject(MAILER_QUEUE_OPTIONS)
    private readonly options: MailerQueueOptions,
    @Optional() private readonly eventService?: MailerEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const bullmq = require('bullmq');
      this.UnrecoverableError = bullmq.UnrecoverableError;
      const queueName = this.options.queueName || 'mailer';

      this.worker = new bullmq.Worker(
        queueName,
        async (job: any) => {
          return this.processJob(job);
        },
        {
          connection: this.options.connection,
          concurrency: this.options.concurrency ?? 5,
        },
      );

      this.worker.on('failed', (job: any, error: Error) => {
        this.logger.error(`Email job ${job?.id} failed: ${error.message}`);
        this.eventService?.emit(MailerEvent.QUEUE_FAILED, {
          mailOptions: job?.data,
          error,
          timestamp: new Date(),
        });
      });

      this.worker.on('completed', (job: any, result: any) => {
        this.eventService?.emit(MailerEvent.QUEUE_COMPLETED, {
          mailOptions: job?.data,
          result,
          timestamp: new Date(),
        });
      });

      this.logger.log(`Mailer queue worker "${queueName}" started`);
    } catch {
      this.logger.warn(
        'bullmq is not installed. Queue processor will not start.',
      );
    }
  }

  private async processJob(job: any): Promise<any> {
    const mailOptions = job.data;
    this.logger.debug(`Processing email job ${job.id}`);
    try {
      // MailerQueueService stores a key with every job. For jobs added
      // directly, the queue, id and creation time stay the same across
      // retries, and two different jobs never share all three.
      return await this.mailerService.sendMail({
        idempotencyKey:
          job.id === undefined
            ? undefined
            : `mailer-job:${this.options.queueName || 'mailer'}:${job.id}:${job.timestamp}`,
        ...mailOptions,
        retry: mailOptions.retry ?? false,
      });
    } catch (error) {
      // A permanent failure (bad recipient, template error) fails the job right
      // away instead of using up BullMQ's attempts
      if (this.UnrecoverableError && !isTransientError(error)) {
        const unrecoverable = new this.UnrecoverableError(
          error instanceof Error ? error.message : String(error),
        );
        (unrecoverable as Error & { cause?: unknown }).cause = error;
        throw unrecoverable;
      }
      throw error;
    }
  }
}
