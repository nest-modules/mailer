import { MailerOptions } from './interfaces/mailer-options.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerService } from './mailer.service';
import { MailerBatchService } from './mailer-batch.service';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function messages(count: number): ISendMailOptions[] {
  return Array.from({ length: count }, (_, i) => ({
    to: `user${i}@example.com`,
    subject: `Message ${i}`,
  }));
}

/** Flush pending promise callbacks without relying on timers. */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('MailerBatchService', () => {
  let sendMail: jest.Mock;

  function createService(options?: MailerOptions): MailerBatchService {
    return new MailerBatchService(
      { sendMail } as unknown as MailerService,
      options,
    );
  }

  beforeEach(() => {
    sendMail = jest.fn();
  });

  describe('sendBatch', () => {
    it('returns an empty result for an empty batch', async () => {
      const service = createService();

      await expect(service.sendBatch({ messages: [] })).resolves.toEqual({
        total: 0,
        sent: 0,
        failed: 0,
        results: [],
      });
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends every message and reports per-item results', async () => {
      sendMail.mockImplementation(async (opts: ISendMailOptions) => ({
        messageId: `<${opts.to}>`,
      }));
      const service = createService();
      const batch = messages(3);

      const result = await service.sendBatch({ messages: batch });

      expect(sendMail).toHaveBeenCalledTimes(3);
      batch.forEach((msg, i) => {
        expect(sendMail).toHaveBeenNthCalledWith(i + 1, msg);
      });
      expect(result).toEqual({
        total: 3,
        sent: 3,
        failed: 0,
        results: [
          {
            index: 0,
            success: true,
            result: { messageId: '<user0@example.com>' },
          },
          {
            index: 1,
            success: true,
            result: { messageId: '<user1@example.com>' },
          },
          {
            index: 2,
            success: true,
            result: { messageId: '<user2@example.com>' },
          },
        ],
      });
    });

    it('keeps sending after failures when stopOnError is false', async () => {
      const failure = new Error('mailbox unavailable');
      sendMail
        .mockResolvedValueOnce('ok-0')
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce('ok-2');
      const service = createService();

      const result = await service.sendBatch({ messages: messages(3) });

      expect(sendMail).toHaveBeenCalledTimes(3);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results).toEqual([
        { index: 0, success: true, result: 'ok-0' },
        { index: 1, success: false, error: failure },
        { index: 2, success: true, result: 'ok-2' },
      ]);
    });

    it('stops sending and marks the remaining messages as failed when stopOnError is true', async () => {
      const failure = new Error('rejected');
      sendMail.mockResolvedValueOnce('ok-0').mockRejectedValueOnce(failure);
      const service = createService();

      const result = await service.sendBatch({
        messages: messages(4),
        concurrency: 1,
        stopOnError: true,
      });

      expect(sendMail).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(4);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(3);
      expect(result.results[0]).toEqual({
        index: 0,
        success: true,
        result: 'ok-0',
      });
      expect(result.results[1]).toEqual({
        index: 1,
        success: false,
        error: failure,
      });
      for (const index of [2, 3]) {
        expect(result.results[index].index).toBe(index);
        expect(result.results[index].success).toBe(false);
        expect(result.results[index].error?.message).toBe(
          'Batch stopped due to previous error',
        );
      }
    });

    it('never runs more sends in parallel than the default concurrency (5)', async () => {
      const pending: Deferred<string>[] = [];
      let inFlight = 0;
      let maxInFlight = 0;
      sendMail.mockImplementation(() => {
        const d = deferred<string>();
        pending.push(d);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return d.promise.finally(() => {
          inFlight--;
        });
      });
      const service = createService();

      const batchPromise = service.sendBatch({ messages: messages(8) });
      await flushPromises();

      // The semaphore is full: only 5 sends started
      expect(sendMail).toHaveBeenCalledTimes(5);

      // Releasing sends lets the remaining ones start
      while (pending.length > 0) {
        pending.shift()!.resolve('ok');
        await flushPromises();
      }

      const result = await batchPromise;
      expect(sendMail).toHaveBeenCalledTimes(8);
      expect(maxInFlight).toBe(5);
      expect(result.sent).toBe(8);
    });

    it('respects a custom concurrency and sorts results by original index', async () => {
      const pending: Deferred<string>[] = [];
      sendMail.mockImplementation(() => {
        const d = deferred<string>();
        pending.push(d);
        return d.promise;
      });
      const service = createService();

      const batchPromise = service.sendBatch({
        messages: messages(3),
        concurrency: 3,
      });
      await flushPromises();
      expect(sendMail).toHaveBeenCalledTimes(3);

      // Complete in reverse order
      pending[2].resolve('r2');
      await flushPromises();
      pending[1].resolve('r1');
      await flushPromises();
      pending[0].resolve('r0');

      const result = await batchPromise;
      expect(result.results.map((r) => r.index)).toEqual([0, 1, 2]);
      expect(result.results.map((r) => r.result)).toEqual(['r0', 'r1', 'r2']);
    });
  });

  describe('rate limiting', () => {
    const START = new Date('2026-01-01T00:00:00Z').getTime();

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(START);
      sendMail.mockImplementation(async () => Date.now() - START);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not delay sends when no rate limit is configured', async () => {
      const service = createService({ transport: 'smtp://localhost' });

      const result = await service.sendBatch({ messages: messages(4) });

      expect(result.results.map((r) => r.result)).toEqual([0, 0, 0, 0]);
    });

    it('limits sends to maxMessages per default 1s period', async () => {
      const service = createService({ rateLimit: { maxMessages: 2 } });

      const batchPromise = service.sendBatch({
        messages: messages(5),
        concurrency: 10,
      });
      await flushPromises();
      expect(sendMail).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(999);
      expect(sendMail).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1);
      expect(sendMail).toHaveBeenCalledTimes(4);

      await jest.advanceTimersByTimeAsync(1000);
      const result = await batchPromise;

      // Send offsets (ms since start) show two messages per window
      expect(result.results.map((r) => r.result)).toEqual([
        0, 0, 1000, 1000, 2000,
      ]);
      expect(result.sent).toBe(5);
    });

    it('uses a custom period and only waits for the oldest send to leave the window', async () => {
      const service = createService({
        rateLimit: { maxMessages: 1, period: 300 },
      });

      const batchPromise = service.sendBatch({
        messages: messages(3),
        concurrency: 10,
      });
      await jest.advanceTimersByTimeAsync(600);
      const result = await batchPromise;

      expect(result.results.map((r) => r.result)).toEqual([0, 300, 600]);
    });

    it('forgets sends that are older than the period across batches', async () => {
      const service = createService({
        rateLimit: { maxMessages: 2, period: 1000 },
      });

      await service.sendBatch({ messages: messages(2) });
      // Let the previous window expire before the next batch
      jest.setSystemTime(START + 5000);

      const result = await service.sendBatch({ messages: messages(2) });

      expect(result.results.map((r) => r.result)).toEqual([5000, 5000]);
    });

    it('throttles a second batch that starts inside the previous window', async () => {
      const service = createService({
        rateLimit: { maxMessages: 2, period: 1000 },
      });

      await service.sendBatch({ messages: messages(2) });
      jest.setSystemTime(START + 400);

      const batchPromise = service.sendBatch({ messages: messages(1) });
      await jest.advanceTimersByTimeAsync(600);
      const result = await batchPromise;

      expect(result.results[0].result).toBe(1000);
    });

    it('treats maxMessages below 1 as a limit of 1', async () => {
      const service = createService({
        rateLimit: { maxMessages: 0, period: 200 },
      });

      const batchPromise = service.sendBatch({
        messages: messages(2),
        concurrency: 10,
      });
      await flushPromises();
      expect(sendMail).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(200);
      const result = await batchPromise;

      expect(result.results.map((r) => r.result)).toEqual([0, 200]);
    });
  });
});
