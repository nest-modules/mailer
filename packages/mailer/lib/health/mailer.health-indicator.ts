import { Injectable, Optional } from '@nestjs/common';
import { MailerService } from '../mailer.service';
import { MailerQueueService } from '../mailer-queue.service';

/**
 * Health indicator for @nestjs/terminus.
 * Checks transporter connectivity and optionally queue health.
 *
 * @example
 * ```typescript
 * @Controller('health')
 * export class HealthController {
 *   constructor(
 *     private health: HealthCheckService,
 *     private mailerHealth: MailerHealthIndicator,
 *   ) {}
 *
 *   @Get()
 *   check() {
 *     return this.health.check([
 *       () => this.mailerHealth.isHealthy('mailer'),
 *     ]);
 *   }
 * }
 * ```
 */
@Injectable()
export class MailerHealthIndicator {
  constructor(
    private readonly mailerService: MailerService,
    @Optional() private readonly queueService?: MailerQueueService,
  ) {}

  /**
   * Check if the mailer is healthy.
   * Verifies all transporters and optionally checks queue metrics.
   */
  async isHealthy(key = 'mailer'): Promise<Record<string, any>> {
    const details: Record<string, any> = {};

    // Check transporters
    try {
      const transportersHealthy =
        await this.mailerService.verifyAllTransporters();
      details.transporters = transportersHealthy ? 'up' : 'down';
    } catch (error) {
      details.transporters = 'down';
      details.error = (error as Error).message;
    }

    // Check queue if available
    if (this.queueService) {
      try {
        const metrics = await this.queueService.getMetrics();
        details.queue = {
          status: 'up',
          ...metrics,
        };
      } catch {
        details.queue = { status: 'down' };
      }
    }

    const isHealthy = details.transporters === 'up';

    return {
      [key]: {
        status: isHealthy ? 'up' : 'down',
        ...details,
      },
    };
  }
}
