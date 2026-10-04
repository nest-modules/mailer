import { Logger } from '@nestjs/common';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerEventService } from './mailer-event.service';
import { MailerQueueService } from './mailer-queue.service';

// Toggles whether the lazily required `bullmq` peer dependency resolves.
let mockBullmqInstalled = true;
const mockQueueInstance = {
  add: jest.fn(),
  addBulk: jest.fn(),
  close: jest.fn(),
  getWaitingCount: jest.fn(),
  getActiveCount: jest.fn(),
  getCompletedCount: jest.fn(),
  getFailedCount: jest.fn(),
  getDelayedCount: jest.fn(),
};
const mockQueueCtor = jest.fn(() => mockQueueInstance);

jest.mock(
  'bullmq',
  () => {
    if (!mockBullmqInstalled) {
      throw new Error("Cannot find module 'bullmq'");
    }
    return { Queue: mockQueueCtor };
  },
  { virtual: true },
);

const NOW = new Date('2026-01-01T12:00:00Z');

const baseOptions: MailerQueueOptions = {
  connection: { host: 'localhost', port: 6379 },
};

const mail: ISendMailOptions = { to: 'a@example.com', subject: 'Hi' };

function createEventService(): { emit: jest.Mock } {
  return { emit: jest.fn() };
}

describe('MailerQueueService', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Force `require('bullmq')` to re-run the mock factory on every test
    jest.resetModules();
    jest.clearAllMocks();
    mockBullmqInstalled = true;
    jest.useFakeTimers().setSystemTime(NOW);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates a "mailer" queue with default retry/backoff job options', async () => {
      const service = new MailerQueueService(baseOptions);
      await service.onModuleInit();

      expect(mockQueueCtor).toHaveBeenCalledWith('mailer', {
        connection: baseOptions.connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });
      expect(logSpy).toHaveBeenCalledWith('Mailer queue "mailer" initialized');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('honours a custom queue name and default job options', async () => {
      const defaultJobOptions: MailerQueueOptions['defaultJobOptions'] = {
        attempts: 7,
        backoff: { type: 'fixed', delay: 250 },
      };
      const service = new MailerQueueService({
        ...baseOptions,
        queueName: 'emails',
        defaultJobOptions,
      });
      await service.onModuleInit();

      expect(mockQueueCtor).toHaveBeenCalledWith('emails', {
        connection: baseOptions.connection,
        defaultJobOptions,
      });
      expect(logSpy).toHaveBeenCalledWith('Mailer queue "emails" initialized');
    });

    it('logs an error and stays uninitialized when bullmq is not installed', async () => {
      mockBullmqInstalled = false;
      const service = new MailerQueueService(baseOptions);

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(mockQueueCtor).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        'bullmq is not installed. Install it with: pnpm add bullmq',
      );
      await expect(service.enqueue(mail)).rejects.toThrow(
        'Mailer queue is not initialized. Is bullmq installed?',
      );
      await expect(service.enqueueBatch([mail])).rejects.toThrow(
        'Mailer queue is not initialized. Is bullmq installed?',
      );
      await expect(service.getMetrics()).rejects.toThrow(
        'Mailer queue is not initialized.',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the queue when it was initialized', async () => {
      const service = new MailerQueueService(baseOptions);
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockQueueInstance.close).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the queue was never initialized', async () => {
      const service = new MailerQueueService(baseOptions);
      await service.onModuleDestroy();

      expect(mockQueueInstance.close).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    it('adds a send-email job and emits a QUEUED event', async () => {
      const job = { id: 'job-1' };
      mockQueueInstance.add.mockResolvedValue(job);
      const events = createEventService();
      const service = new MailerQueueService(
        baseOptions,
        events as unknown as MailerEventService,
      );
      await service.onModuleInit();

      const jobOptions = { priority: 1 };
      await expect(service.enqueue(mail, jobOptions)).resolves.toBe(job);

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'send-email',
        mail,
        jobOptions,
      );
      expect(events.emit).toHaveBeenCalledWith(MailerEvent.QUEUED, {
        mailOptions: mail,
        timestamp: NOW,
      });
    });

    it('works without an event service', async () => {
      mockQueueInstance.add.mockResolvedValue({ id: 'job-2' });
      const service = new MailerQueueService(baseOptions);
      await service.onModuleInit();

      await expect(service.enqueue(mail)).resolves.toEqual({ id: 'job-2' });
      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'send-email',
        mail,
        undefined,
      );
    });

    it('does not emit QUEUED when adding the job fails', async () => {
      mockQueueInstance.add.mockRejectedValue(new Error('redis down'));
      const events = createEventService();
      const service = new MailerQueueService(
        baseOptions,
        events as unknown as MailerEventService,
      );
      await service.onModuleInit();

      await expect(service.enqueue(mail)).rejects.toThrow('redis down');
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('enqueueBatch', () => {
    const messages: ISendMailOptions[] = [
      { to: 'a@example.com' },
      { to: 'b@example.com' },
    ];

    it('adds all jobs in bulk and emits one QUEUED event per message', async () => {
      const jobs = [{ id: '1' }, { id: '2' }];
      mockQueueInstance.addBulk.mockResolvedValue(jobs);
      const events = createEventService();
      const service = new MailerQueueService(
        baseOptions,
        events as unknown as MailerEventService,
      );
      await service.onModuleInit();

      const jobOptions = { delay: 500 };
      await expect(service.enqueueBatch(messages, jobOptions)).resolves.toBe(
        jobs,
      );

      expect(mockQueueInstance.addBulk).toHaveBeenCalledWith([
        { name: 'send-email', data: messages[0], opts: jobOptions },
        { name: 'send-email', data: messages[1], opts: jobOptions },
      ]);
      expect(events.emit).toHaveBeenCalledTimes(2);
      expect(events.emit).toHaveBeenNthCalledWith(1, MailerEvent.QUEUED, {
        mailOptions: messages[0],
        timestamp: NOW,
      });
      expect(events.emit).toHaveBeenNthCalledWith(2, MailerEvent.QUEUED, {
        mailOptions: messages[1],
        timestamp: NOW,
      });
    });

    it('works without an event service', async () => {
      mockQueueInstance.addBulk.mockResolvedValue([]);
      const service = new MailerQueueService(baseOptions);
      await service.onModuleInit();

      await expect(service.enqueueBatch(messages)).resolves.toEqual([]);
      expect(mockQueueInstance.addBulk).toHaveBeenCalledWith([
        { name: 'send-email', data: messages[0], opts: undefined },
        { name: 'send-email', data: messages[1], opts: undefined },
      ]);
    });
  });

  describe('getMetrics', () => {
    it('aggregates the job counts reported by the queue', async () => {
      mockQueueInstance.getWaitingCount.mockResolvedValue(1);
      mockQueueInstance.getActiveCount.mockResolvedValue(2);
      mockQueueInstance.getCompletedCount.mockResolvedValue(3);
      mockQueueInstance.getFailedCount.mockResolvedValue(4);
      mockQueueInstance.getDelayedCount.mockResolvedValue(5);
      const service = new MailerQueueService(baseOptions);
      await service.onModuleInit();

      await expect(service.getMetrics()).resolves.toEqual({
        waiting: 1,
        active: 2,
        completed: 3,
        failed: 4,
        delayed: 5,
      });
    });
  });
});
