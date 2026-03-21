import { Injectable } from '@nestjs/common';
import {
  BatchItemResult,
  BatchMailOptions,
  BatchResult,
} from './interfaces/batch-options.interface';
import { MailerService } from './mailer.service';

/**
 * Service for sending emails in batches with concurrency control.
 */
@Injectable()
export class MailerBatchService {
  constructor(private readonly mailerService: MailerService) {}

  /**
   * Send multiple emails with concurrency control.
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

  private async sendOne(
    mailOptions: any,
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
