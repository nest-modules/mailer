import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { MAILER_QUEUE_OPTIONS } from './constants/mailer.constant';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerEventService } from './mailer-event.service';

/**
 * Service for enqueuing emails via BullMQ.
 * Requires `bullmq` to be installed.
 */
@Injectable()
export class MailerQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailerQueueService.name);
  private queue: any;
  private Queue: any;

  constructor(
    @Inject(MAILER_QUEUE_OPTIONS)
    private readonly options: MailerQueueOptions,
    @Optional() private readonly eventService?: MailerEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const bullmq = require('bullmq');
      this.Queue = bullmq.Queue;

      const queueName = this.options.queueName || 'mailer';
      this.queue = new this.Queue(queueName, {
        connection: this.options.connection,
        defaultJobOptions: this.options.defaultJobOptions || {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });

      this.logger.log(`Mailer queue "${queueName}" initialized`);
    } catch {
      this.logger.error(
        'bullmq is not installed. Install it with: pnpm add bullmq',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  /**
   * Add an email to the queue.
   */
  async enqueue(
    mailOptions: ISendMailOptions,
    jobOptions?: Record<string, any>,
  ): Promise<any> {
    if (!this.queue) {
      throw new Error('Mailer queue is not initialized. Is bullmq installed?');
    }

    const job = await this.queue.add('send-email', mailOptions, jobOptions);

    this.eventService?.emit(MailerEvent.QUEUED, {
      mailOptions,
      timestamp: new Date(),
    });

    return job;
  }

  /**
   * Add multiple emails to the queue.
   */
  async enqueueBatch(
    messages: ISendMailOptions[],
    jobOptions?: Record<string, any>,
  ): Promise<any[]> {
    if (!this.queue) {
      throw new Error('Mailer queue is not initialized. Is bullmq installed?');
    }

    const jobs = await this.queue.addBulk(
      messages.map((data) => ({
        name: 'send-email',
        data,
        opts: jobOptions,
      })),
    );

    for (const msg of messages) {
      this.eventService?.emit(MailerEvent.QUEUED, {
        mailOptions: msg,
        timestamp: new Date(),
      });
    }

    return jobs;
  }

  /**
   * Get queue metrics.
   */
  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      throw new Error('Mailer queue is not initialized.');
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
