import { Logger } from '@nestjs/common';
import { MailerEvent } from './interfaces/mailer-events.interface';
import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerService } from './mailer.service';
import { MailerEventService } from './mailer-event.service';
import { MailerQueueProcessor } from './mailer-queue.processor';

// Toggles whether the lazily required `bullmq` peer dependency resolves.
let mockBullmqInstalled = true;
const mockWorkerInstance = { on: jest.fn() };
const mockWorkerCtor = jest.fn(() => mockWorkerInstance);

jest.mock(
  'bullmq',
  () => {
    if (!mockBullmqInstalled) {
      throw new Error("Cannot find module 'bullmq'");
    }
    return { Worker: mockWorkerCtor };
  },
  { virtual: true },
);

const NOW = new Date('2026-01-01T12:00:00Z');

const baseOptions: MailerQueueOptions = {
  connection: { host: 'localhost', port: 6379 },
};

type Handler = (...args: any[]) => any;

/** Returns the job processor passed to the Worker constructor. */
function getProcessor(): Handler {
  const calls = mockWorkerCtor.mock.calls as unknown as any[][];
  return calls[0][1];
}

/** Returns the listener registered on the worker for the given event. */
function getHandler(event: string): Handler {
  const call = mockWorkerInstance.on.mock.calls.find(
    ([name]) => name === event,
  );
  if (!call) throw new Error(`No handler registered for "${event}"`);
  return call[1];
}

describe('MailerQueueProcessor', () => {
  let mailer: { sendMail: jest.Mock };
  let events: { emit: jest.Mock };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    // Force `require('bullmq')` to re-run the mock factory on every test
    jest.resetModules();
    jest.clearAllMocks();
    mockBullmqInstalled = true;
    jest.useFakeTimers().setSystemTime(NOW);
    mailer = { sendMail: jest.fn() };
    events = { emit: jest.fn() };
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function createProcessor(
    options: MailerQueueOptions = baseOptions,
    withEvents = true,
  ): Promise<MailerQueueProcessor> {
    const processor = new MailerQueueProcessor(
      mailer as unknown as MailerService,
      options,
      withEvents ? (events as unknown as MailerEventService) : undefined,
    );
    await processor.onModuleInit();
    return processor;
  }

  describe('onModuleInit', () => {
    it('starts a worker on the default "mailer" queue', async () => {
      await createProcessor();

      expect(mockWorkerCtor).toHaveBeenCalledWith(
        'mailer',
        expect.any(Function),
        { connection: baseOptions.connection, concurrency: 5 },
      );
      expect(mockWorkerInstance.on).toHaveBeenCalledWith(
        'failed',
        expect.any(Function),
      );
      expect(mockWorkerInstance.on).toHaveBeenCalledWith(
        'completed',
        expect.any(Function),
      );
      expect(logSpy).toHaveBeenCalledWith(
        'Mailer queue worker "mailer" started',
      );
    });

    it('uses a custom queue name', async () => {
      await createProcessor({ ...baseOptions, queueName: 'emails' });

      expect(mockWorkerCtor).toHaveBeenCalledWith(
        'emails',
        expect.any(Function),
        expect.anything(),
      );
      expect(logSpy).toHaveBeenCalledWith(
        'Mailer queue worker "emails" started',
      );
    });

    it('warns and does not start a worker when bullmq is not installed', async () => {
      mockBullmqInstalled = false;

      await expect(createProcessor()).resolves.toBeInstanceOf(
        MailerQueueProcessor,
      );

      expect(mockWorkerCtor).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'bullmq is not installed. Queue processor will not start.',
      );
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('job processing', () => {
    it('sends the job payload through MailerService and returns its result', async () => {
      const info = { messageId: '<abc@example.com>' };
      mailer.sendMail.mockResolvedValue(info);
      await createProcessor();

      const data = { to: 'a@example.com', subject: 'Queued' };
      await expect(getProcessor()({ id: '42', data })).resolves.toBe(info);

      expect(mailer.sendMail).toHaveBeenCalledWith(data);
      expect(debugSpy).toHaveBeenCalledWith('Processing email job 42');
    });

    it('propagates send errors so BullMQ can retry the job', async () => {
      mailer.sendMail.mockRejectedValue(new Error('SMTP timeout'));
      await createProcessor();

      await expect(
        getProcessor()({ id: '7', data: { to: 'a@example.com' } }),
      ).rejects.toThrow('SMTP timeout');
    });
  });

  describe('worker events', () => {
    it('logs and emits QUEUE_FAILED when a job fails', async () => {
      await createProcessor();
      const data = { to: 'a@example.com' };
      const error = new Error('boom');

      getHandler('failed')({ id: '9', data }, error);

      expect(errorSpy).toHaveBeenCalledWith('Email job 9 failed: boom');
      expect(events.emit).toHaveBeenCalledWith(MailerEvent.QUEUE_FAILED, {
        mailOptions: data,
        error,
        timestamp: NOW,
      });
    });

    it('handles a failed event without a job (e.g. stalled job lookup)', async () => {
      await createProcessor();
      const error = new Error('lost');

      getHandler('failed')(undefined, error);

      expect(errorSpy).toHaveBeenCalledWith('Email job undefined failed: lost');
      expect(events.emit).toHaveBeenCalledWith(MailerEvent.QUEUE_FAILED, {
        mailOptions: undefined,
        error,
        timestamp: NOW,
      });
    });

    it('emits QUEUE_COMPLETED with the send result when a job completes', async () => {
      await createProcessor();
      const data = { to: 'a@example.com' };
      const result = { messageId: '<id>' };

      getHandler('completed')({ id: '1', data }, result);

      expect(events.emit).toHaveBeenCalledWith(MailerEvent.QUEUE_COMPLETED, {
        mailOptions: data,
        result,
        timestamp: NOW,
      });
    });

    it('handles a completed event without a job', async () => {
      await createProcessor();

      getHandler('completed')(undefined, 'ok');

      expect(events.emit).toHaveBeenCalledWith(MailerEvent.QUEUE_COMPLETED, {
        mailOptions: undefined,
        result: 'ok',
        timestamp: NOW,
      });
    });

    it('does not fail when no event service is available', async () => {
      await createProcessor(baseOptions, false);

      expect(() =>
        getHandler('failed')({ id: '3', data: {} }, new Error('x')),
      ).not.toThrow();
      expect(() =>
        getHandler('completed')({ id: '3', data: {} }, {}),
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith('Email job 3 failed: x');
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
