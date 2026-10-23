import { MailerRetryOptions } from '../interfaces/retry-options.interface';

const DEFAULT_BACKOFF = {
  delay: 1000,
  factor: 2,
  maxDelay: 30_000,
  jitter: 'full' as const,
};

/** The longest delay `setTimeout` supports (about 24.8 days) */
const MAX_TIMER_MS = 2_147_483_647;

/** Nodemailer / Node.js error codes that mean "try again later" */
const TRANSIENT_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'EPROTOCOL',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNABORTED',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** Codes for which another transport may succeed, even though a retry on the same one won't */
const FAILOVER_CODES = new Set(['EAUTH', 'ETLS', 'ENOAUTH', 'EOAUTH2']);

export interface ResolvedRetry {
  attempts: number;
  backoff:
    | Required<
        Exclude<
          MailerRetryOptions['backoff'],
          ((...args: any[]) => number) | undefined
        >
      >
    | ((attempt: number, error: unknown) => number);
  retryIf?: (error: unknown, attempt: number) => boolean;
}

/**
 * Normalizes a `retry` option: a number of attempts, `false` for a single one,
 * or options. `undefined` means the defaults: 3 attempts, exponential backoff.
 */
export function resolveRetry(
  input: number | false | MailerRetryOptions | undefined,
): ResolvedRetry {
  const options: MailerRetryOptions =
    input === false
      ? { attempts: 1 }
      : input === undefined
        ? {}
        : typeof input === 'number'
          ? { attempts: input }
          : input;
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new TypeError(
      `retry.attempts must be a whole number of at least 1 (got ${attempts})`,
    );
  }
  if (typeof options.backoff === 'function') {
    return { attempts, backoff: options.backoff, retryIf: options.retryIf };
  }
  // Unset keys (`delay: config.get('X')` returning undefined) keep their default
  const given = Object.fromEntries(
    Object.entries(options.backoff ?? {}).filter(([, v]) => v !== undefined),
  );
  const backoff = { ...DEFAULT_BACKOFF, ...given };
  if (!(backoff.factor >= 1)) {
    throw new TypeError(
      `retry.backoff.factor must be at least 1 (got ${backoff.factor})`,
    );
  }
  for (const key of ['delay', 'maxDelay'] as const) {
    if (!Number.isFinite(backoff[key]) || backoff[key] < 0) {
      throw new TypeError(
        `retry.backoff.${key} must be a number of milliseconds (got ${backoff[key]})`,
      );
    }
  }
  return { attempts, backoff, retryIf: options.retryIf };
}

/** The wait after attempt `attempt` (1-based) failed, honoring a provider's `Retry-After` */
export function retryDelay(
  retry: ResolvedRetry,
  attempt: number,
  error: unknown,
  random: () => number = Math.random,
): number {
  let delay: number;
  let cap = DEFAULT_BACKOFF.maxDelay;
  if (typeof retry.backoff === 'function') {
    delay = retry.backoff(attempt, error);
  } else {
    const { delay: base, factor, maxDelay, jitter } = retry.backoff;
    cap = maxDelay;
    const ceiling = Math.min(maxDelay, base * factor ** (attempt - 1));
    delay =
      jitter === 'none'
        ? ceiling
        : jitter === 'equal'
          ? ceiling / 2 + (random() * ceiling) / 2
          : random() * ceiling;
  }
  const retryAfter = (error as { retryAfterMs?: unknown })?.retryAfterMs;
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    delay = Math.max(delay, Math.min(retryAfter, cap));
  }
  return Math.min(MAX_TIMER_MS, Math.max(0, Math.floor(delay)));
}

/**
 * Whether sending the same message again could succeed. Follows the same rules as
 * `@nestjs/mail`, extended to understand nodemailer errors:
 * - an explicit `permanent` flag wins;
 * - SMTP `responseCode` 5xx is permanent, 4xx transient (greylisting, rate limits);
 * - HTTP `status`/`statusCode` 408, 409, 429 and 5xx are transient, other 4xx permanent;
 * - network codes (`ECONNECTION`, `ETIMEDOUT`, …) are transient;
 * - programming and template errors (`TypeError`, missing files, …) are permanent.
 */
export function isTransientError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return true;
  const err = error as Record<string, any>;
  if (typeof err.permanent === 'boolean') return !err.permanent;
  // AWS SDK v3 (e.g. @aws-sdk/client-sesv2 through nodemailer's SES transport)
  if (typeof err.$retryable === 'object' && err.$retryable !== null)
    return true;
  if (err.$fault === 'client') return false;
  if (err.$fault === 'server') return true;

  if (typeof err.responseCode === 'number') {
    return err.responseCode < 500;
  }

  const status = [
    err.status,
    err.statusCode,
    err.$metadata?.httpStatusCode,
  ].find((value) => typeof value === 'number');
  if (typeof status === 'number' && status >= 400) {
    return status >= 500 || [408, 409, 429].includes(status);
  }

  if (typeof err.code === 'string') {
    return TRANSIENT_CODES.has(err.code);
  }

  if (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error instanceof RangeError
  ) {
    return false;
  }

  return true;
}

/** SMTP commands after which the server has not received the message yet */
const BEFORE_DATA = new Set([
  'CONN',
  'EHLO',
  'HELO',
  'LHLO',
  'STARTTLS',
  'AUTH',
  'AUTH PLAIN',
  'AUTH LOGIN',
  'AUTH XOAUTH2',
  'AUTH CRAM-MD5',
  'MAIL FROM',
  'RCPT TO',
]);

/** Codes of failures that can happen after the server already accepted the message */
const AMBIGUOUS_CODES = new Set([
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ESOCKET',
  'EPIPE',
  'ECONNABORTED',
  'UND_ERR_SOCKET',
]);

/**
 * Whether the message may have been delivered despite the error: the mailer's
 * own timeout (the send keeps running), or a dropped connection once the
 * message was being handed over. Retrying then risks a duplicate, so the
 * mailer only does it when the message has a stable `Message-ID`.
 */
export function mayHaveBeenDelivered(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const err = error as Record<string, any>;
  if (err.mailerTimeout === true) return true;
  if (typeof err.code !== 'string' || !AMBIGUOUS_CODES.has(err.code)) {
    return false;
  }
  return (
    typeof err.command !== 'string' ||
    !BEFORE_DATA.has(err.command.toUpperCase())
  );
}

/**
 * Whether another transport could deliver the message: transient failures, and
 * failures of the transport itself (bad credentials, TLS) rather than of the message.
 */
export function canFailover(error: unknown): boolean {
  if (isTransientError(error)) return true;
  // Non-objects are transient, so `error` is an object here
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && FAILOVER_CODES.has(code);
}

/** The reason an aborted signal carries, or a standard `AbortError` */
export function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Waits `ms`, rejecting early when `signal` aborts */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Settles with `promise`, or rejects as soon as `signal` aborts */
export function raceSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
