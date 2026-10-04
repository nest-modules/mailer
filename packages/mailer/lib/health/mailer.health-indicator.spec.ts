import { MailerService } from '../mailer.service';
import { MailerQueueService } from '../mailer-queue.service';
import { MailerHealthIndicator } from './mailer.health-indicator';

const metrics = {
  waiting: 1,
  active: 2,
  completed: 3,
  failed: 4,
  delayed: 5,
};

function createMailerService(
  verify: () => Promise<boolean>,
): jest.Mocked<Pick<MailerService, 'verifyAllTransporters'>> {
  return { verifyAllTransporters: jest.fn(verify) };
}

function createQueueService(
  getMetrics: () => Promise<typeof metrics>,
): jest.Mocked<Pick<MailerQueueService, 'getMetrics'>> {
  return { getMetrics: jest.fn(getMetrics) };
}

describe('MailerHealthIndicator', () => {
  describe('without a queue service', () => {
    it('reports up under the default key when all transporters verify', async () => {
      const mailer = createMailerService(async () => true);
      const indicator = new MailerHealthIndicator(
        mailer as unknown as MailerService,
      );

      await expect(indicator.isHealthy()).resolves.toEqual({
        mailer: { status: 'up', transporters: 'up' },
      });
      expect(mailer.verifyAllTransporters).toHaveBeenCalledTimes(1);
    });

    it('reports down under a custom key when a transporter fails to verify', async () => {
      const indicator = new MailerHealthIndicator(
        createMailerService(async () => false) as unknown as MailerService,
      );

      await expect(indicator.isHealthy('smtp')).resolves.toEqual({
        smtp: { status: 'down', transporters: 'down' },
      });
    });

    it('reports down with the error message when verification throws', async () => {
      const indicator = new MailerHealthIndicator(
        createMailerService(async () => {
          throw new Error('connection refused');
        }) as unknown as MailerService,
      );

      await expect(indicator.isHealthy()).resolves.toEqual({
        mailer: {
          status: 'down',
          transporters: 'down',
          error: 'connection refused',
        },
      });
    });
  });

  describe('with a queue service', () => {
    it('includes queue metrics with an up status', async () => {
      const queue = createQueueService(async () => metrics);
      const indicator = new MailerHealthIndicator(
        createMailerService(async () => true) as unknown as MailerService,
        queue as unknown as MailerQueueService,
      );

      await expect(indicator.isHealthy()).resolves.toEqual({
        mailer: {
          status: 'up',
          transporters: 'up',
          queue: { status: 'up', ...metrics },
        },
      });
      expect(queue.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('marks the queue down without affecting overall status when metrics fail', async () => {
      const indicator = new MailerHealthIndicator(
        createMailerService(async () => true) as unknown as MailerService,
        createQueueService(async () => {
          throw new Error('redis unavailable');
        }) as unknown as MailerQueueService,
      );

      await expect(indicator.isHealthy()).resolves.toEqual({
        mailer: {
          status: 'up',
          transporters: 'up',
          queue: { status: 'down' },
        },
      });
    });

    it('reports down when transporters fail even if the queue is up', async () => {
      const indicator = new MailerHealthIndicator(
        createMailerService(async () => false) as unknown as MailerService,
        createQueueService(
          async () => metrics,
        ) as unknown as MailerQueueService,
      );

      const result = await indicator.isHealthy();
      expect(result.mailer.status).toBe('down');
      expect(result.mailer.queue.status).toBe('up');
    });
  });
});
