import { Inject, Injectable, Optional } from '@nestjs/common';
import { MAILER_OPTIONS } from './constants/mailer.constant';
import {
  BatchItemResult,
  BatchMailOptions,
  BatchResult,
} from './interfaces/batch-options.interface';
import { MailerOptions } from './interfaces/mailer-options.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerService } from './mailer.service';

/**
 * Service for sending emails in batches with concurrency control and rate limiting.
 */
@Injectable()
export class MailerBatchService {
  private sendTimestamps: number[] = [];

  constructor(
    private readonly mailerService: MailerService,
    @Optional()
    @Inject(MAILER_OPTIONS)
    private readonly mailerOptions?: MailerOptions,
  ) {}

  /**
   * Send multiple emails with concurrency control and optional rate limiting.
   */
  async sendBatch(options: BatchMailOptions): Promise<BatchResult> {
    const { messages, concurrency = 5, stopOnError = false } = options;
    const results: BatchItemResult[] = [];
    let sent = 0;
    let failed = 0;

    // Simple semaphore for concurrency control
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < messages.length; i++) {
      if (stopOnError && failed > 0) {
        // Mark remaining as failed
        results.push({
          index: i,
          success: false,
          error: new Error('Batch stopped due to previous error'),
        });
        failed++;
        continue;
      }

      // Feature 8: Rate limiting
      await this.waitForRateLimit();

      const task = this.sendOne(messages[i], i).then((result) => {
        results.push(result);
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      });

      const wrappedTask = task.then(() => {
        executing.delete(wrappedTask);
      });
      executing.add(wrappedTask);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    // Wait for all remaining tasks
    await Promise.all(executing);

    // Sort results by index
    results.sort((a, b) => a.index - b.index);

    return {
      total: messages.length,
      sent,
      failed,
      results,
    };
  }

  /** Rate-limit aware wait */
  private async waitForRateLimit(): Promise<void> {
    const rateLimit = this.mailerOptions?.rateLimit;
    if (!rateLimit) return;

    const period = rateLimit.period || 1000;
    const now = Date.now();

    // Remove timestamps outside the current window
    this.sendTimestamps = this.sendTimestamps.filter((t) => now - t < period);

    if (this.sendTimestamps.length >= rateLimit.maxMessages) {
      const oldestInWindow = this.sendTimestamps[0];
      const waitTime = period - (now - oldestInWindow);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      // Clean up again after waiting
      const newNow = Date.now();
      this.sendTimestamps = this.sendTimestamps.filter(
        (t) => newNow - t < period,
      );
    }

    this.sendTimestamps.push(Date.now());
  }

  private async sendOne(
    mailOptions: ISendMailOptions,
    index: number,
  ): Promise<BatchItemResult> {
    try {
      const result = await this.mailerService.sendMail(mailOptions);
      return { index, success: true, result };
    } catch (error) {
      return { index, success: false, error: error as Error };
    }
  }
}
