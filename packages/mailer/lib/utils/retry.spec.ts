import {
  abortReason,
  canFailover,
  isTransientError,
  mayHaveBeenDelivered,
  raceSignal,
  resolveRetry,
  retryDelay,
  sleep,
} from './retry';

describe('retry utilities', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('resolveRetry', () => {
    it('should default to 3 attempts with exponential backoff', () => {
      expect(resolveRetry(undefined)).toEqual({
        attempts: 3,
        backoff: { delay: 1000, factor: 2, maxDelay: 30_000, jitter: 'full' },
        retryIf: undefined,
      });
    });

    it('should send once with `false`', () => {
      expect(resolveRetry(false).attempts).toBe(1);
    });

    it('should take a number as the attempt count', () => {
      expect(resolveRetry(5).attempts).toBe(5);
    });

    it('should merge partial backoff options over the defaults', () => {
      const retryIf = () => true;
      expect(
        resolveRetry({ attempts: 2, backoff: { delay: 10 }, retryIf }),
      ).toEqual({
        attempts: 2,
        backoff: { delay: 10, factor: 2, maxDelay: 30_000, jitter: 'full' },
        retryIf,
      });
    });

    it('should keep a backoff function', () => {
      const backoff = () => 5;
      expect(resolveRetry({ backoff })).toEqual({
        attempts: 3,
        backoff,
        retryIf: undefined,
      });
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'should reject %p attempts',
      (attempts) => {
        expect(() => resolveRetry({ attempts })).toThrow(
          /retry.attempts must be a whole number/,
        );
      },
    );

    it('should keep defaults for backoff keys given as undefined', () => {
      expect(
        resolveRetry({ backoff: { delay: undefined, maxDelay: 500 } }).backoff,
      ).toEqual({ delay: 1000, factor: 2, maxDelay: 500, jitter: 'full' });
    });

    it.each([
      ['delay', Number.NaN],
      ['delay', -1],
      ['maxDelay', Number.POSITIVE_INFINITY],
    ])('should reject backoff.%s = %p', (key, value) => {
      expect(() => resolveRetry({ backoff: { [key]: value } })).toThrow(
        `retry.backoff.${key} must be a number of milliseconds`,
      );
    });

    it('should reject a factor below 1', () => {
      expect(() => resolveRetry({ backoff: { factor: 0.5 } })).toThrow(
        'retry.backoff.factor must be at least 1 (got 0.5)',
      );
    });
  });

  describe('retryDelay', () => {
    const policy = (jitter: 'full' | 'equal' | 'none', maxDelay = 30_000) =>
      resolveRetry({ backoff: { delay: 100, factor: 2, maxDelay, jitter } });

    it('should grow exponentially without jitter', () => {
      const retry = policy('none');
      expect(retryDelay(retry, 1, new Error())).toBe(100);
      expect(retryDelay(retry, 2, new Error())).toBe(200);
      expect(retryDelay(retry, 3, new Error())).toBe(400);
    });

    it('should cap the delay at maxDelay', () => {
      expect(retryDelay(policy('none', 150), 5, new Error())).toBe(150);
    });

    it('should pick a delay below the ceiling with full jitter', () => {
      expect(retryDelay(policy('full'), 2, new Error(), () => 0.5)).toBe(100);
    });

    it('should keep at least half the ceiling with equal jitter', () => {
      expect(retryDelay(policy('equal'), 2, new Error(), () => 0)).toBe(100);
      expect(retryDelay(policy('equal'), 2, new Error(), () => 1)).toBe(200);
    });

    it('should use the default random source', () => {
      const delay = retryDelay(policy('full'), 1, new Error());
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(100);
    });

    it('should call a backoff function with the attempt and the error', () => {
      const error = new Error('x');
      const backoff = jest.fn(() => 42.7);
      expect(retryDelay(resolveRetry({ backoff }), 3, error)).toBe(42);
      expect(backoff).toHaveBeenCalledWith(3, error);
    });

    it('should never return a negative delay', () => {
      expect(retryDelay(resolveRetry({ backoff: () => -5 }), 1, null)).toBe(0);
    });

    it('should wait at least as long as Retry-After asks, up to maxDelay', () => {
      const retry = policy('none', 1000);
      expect(retryDelay(retry, 1, { retryAfterMs: 500 })).toBe(500);
      expect(retryDelay(retry, 1, { retryAfterMs: 5000 })).toBe(1000);
      expect(retryDelay(retry, 1, { retryAfterMs: 50 })).toBe(100);
      expect(retryDelay(retry, 1, { retryAfterMs: 'soon' })).toBe(100);
      expect(retryDelay(retry, 1, undefined)).toBe(100);
    });

    it('should cap Retry-After at 30s with a backoff function', () => {
      const retry = resolveRetry({ backoff: () => 10 });
      expect(retryDelay(retry, 1, { retryAfterMs: 60_000 })).toBe(30_000);
    });
  });

  describe('isTransientError', () => {
    it.each([
      ['an explicit permanent flag', { permanent: true }, false],
      [
        'an explicit transient flag',
        { permanent: false, responseCode: 550 },
        true,
      ],
      ['a 5xx SMTP reply', { responseCode: 550 }, false],
      ['a 4xx SMTP reply', { responseCode: 421 }, true],
      ['an HTTP 400', { status: 400 }, false],
      ['an HTTP 422 statusCode', { statusCode: 422 }, false],
      ['an HTTP 408', { status: 408 }, true],
      ['an HTTP 409', { status: 409 }, true],
      ['an HTTP 429', { status: 429 }, true],
      ['an HTTP 503', { status: 503 }, true],
      ['a status that is not a number', { status: 'failed' }, true],
      ['an AWS throttling error', { $retryable: { throttling: true } }, true],
      ['an AWS client fault', { $fault: 'client', $retryable: null }, false],
      ['an AWS server fault', { $fault: 'server' }, true],
      [
        'an AWS 400 without fault',
        { $metadata: { httpStatusCode: 400 } },
        false,
      ],
      [
        'an HTTP 200 with a network code',
        { status: 200, code: 'ECONNRESET' },
        true,
      ],
      ['a connection failure', { code: 'ECONNECTION' }, true],
      ['a timeout', { code: 'ETIMEDOUT' }, true],
      ['an undici socket error', { code: 'UND_ERR_SOCKET' }, true],
      ['an authentication failure', { code: 'EAUTH' }, false],
      ['an envelope error', { code: 'EENVELOPE' }, false],
      ['a missing file', { code: 'ENOENT' }, false],
      ['a TypeError', new TypeError('x'), false],
      ['a ReferenceError', new ReferenceError('x'), false],
      ['a SyntaxError', new SyntaxError('x'), false],
      ['a RangeError', new RangeError('x'), false],
      ['a plain Error', new Error('x'), true],
      ['a string', 'boom', true],
      ['null', null, true],
    ])('should classify %s', (_, error, transient) => {
      expect(isTransientError(error)).toBe(transient);
    });
  });

  describe('mayHaveBeenDelivered', () => {
    it.each([
      ['its own timeout', { mailerTimeout: true }, true],
      [
        'a reset while sending DATA',
        { code: 'ECONNRESET', command: 'DATA' },
        true,
      ],
      ['a socket error without command', { code: 'ESOCKET' }, true],
      ['a timeout at connect', { code: 'ETIMEDOUT', command: 'CONN' }, false],
      [
        'a reset at RCPT TO (any case)',
        { code: 'ECONNRESET', command: 'rcpt to' },
        false,
      ],
      ['a refused connection', { code: 'ECONNREFUSED' }, false],
      ['an SMTP reply', { responseCode: 451 }, false],
      ['a string', 'boom', false],
      ['null', null, false],
    ])('should decide for %s', (_, error, expected) => {
      expect(mayHaveBeenDelivered(error)).toBe(expected);
    });
  });

  describe('canFailover', () => {
    it.each([
      ['a transient error', { code: 'ECONNECTION' }, true],
      ['bad credentials', { code: 'EAUTH' }, true],
      ['a TLS failure', { code: 'ETLS' }, true],
      ['a rejected recipient', { responseCode: 550 }, false],
      ['a template error', new TypeError('x'), false],
      ['a permanent error without code', { permanent: true }, false],
      ['a missing error', undefined, true],
    ])('should decide for %s', (_, error, expected) => {
      expect(canFailover(error)).toBe(expected);
    });
  });

  describe('abortReason', () => {
    it("should return the signal's reason", () => {
      const controller = new AbortController();
      const reason = new Error('stop');
      controller.abort(reason);
      expect(abortReason(controller.signal)).toBe(reason);
    });

    it('should build an AbortError when there is no reason', () => {
      const signal = { reason: undefined } as AbortSignal;
      const error = abortReason(signal) as Error;
      expect(error.name).toBe('AbortError');
      expect(error.message).toBe('The operation was aborted');
    });
  });

  describe('sleep', () => {
    it('should resolve without a signal', async () => {
      await expect(sleep(1)).resolves.toBeUndefined();
    });

    it('should resolve after the delay', async () => {
      jest.useFakeTimers();
      const done = jest.fn();
      const pending = sleep(100).then(done);
      await jest.advanceTimersByTimeAsync(99);
      expect(done).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toHaveBeenCalled();
    });

    it('should reject at once with an aborted signal', async () => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));
      await expect(sleep(100, controller.signal)).rejects.toThrow('cancelled');
    });

    it('should reject when the signal aborts while waiting', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const pending = sleep(10_000, controller.signal);
      controller.abort(new Error('cancelled'));
      await expect(pending).rejects.toThrow('cancelled');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should stop listening to the signal once resolved', async () => {
      jest.useFakeTimers();
      const controller = new AbortController();
      const remove = jest.spyOn(controller.signal, 'removeEventListener');
      const pending = sleep(10, controller.signal);
      await jest.advanceTimersByTimeAsync(10);
      await pending;
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });

  describe('raceSignal', () => {
    it('should return the promise as is without a signal', () => {
      const promise = Promise.resolve(1);
      expect(raceSignal(promise)).toBe(promise);
    });

    it('should reject at once with an aborted signal and ignore the promise', async () => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled'));
      const promise = Promise.reject(new Error('late'));
      await expect(raceSignal(promise, controller.signal)).rejects.toThrow(
        'cancelled',
      );
    });

    it('should settle with the promise', async () => {
      const { signal } = new AbortController();
      await expect(raceSignal(Promise.resolve('ok'), signal)).resolves.toBe(
        'ok',
      );
      await expect(
        raceSignal(Promise.reject(new Error('failed')), signal),
      ).rejects.toThrow('failed');
    });

    it('should reject when the signal aborts first', async () => {
      const controller = new AbortController();
      const pending = raceSignal(
        new Promise(() => undefined),
        controller.signal,
      );
      controller.abort(new Error('cancelled'));
      await expect(pending).rejects.toThrow('cancelled');
    });
  });
});
