import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { MAILER_QUEUE_OPTIONS } from './constants/mailer.constant';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerEventService } from './mailer-event.service';
import { MailerService } from './mailer.service';

/**
 * BullMQ worker that processes queued emails.
 */
@Injectable()
export class MailerQueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(MailerQueueProcessor.name);
  private worker: any;

  constructor(
    private readonly mailerService: MailerService,
    @Inject(MAILER_QUEUE_OPTIONS)
    private readonly options: MailerQueueOptions,
    @Optional() private readonly eventService?: MailerEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const bullmq = require('bullmq');
      const queueName = this.options.queueName || 'mailer';

      this.worker = new bullmq.Worker(
        queueName,
        async (job: any) => {
          return this.processJob(job);
        },
        {
          connection: this.options.connection,
          concurrency: 5,
        },
      );

      this.worker.on('failed', (job: any, error: Error) => {
        this.logger.error(
          `Email job ${job?.id} failed: ${error.message}`,
        );
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
    return this.mailerService.sendMail(mailOptions);
  }
}
