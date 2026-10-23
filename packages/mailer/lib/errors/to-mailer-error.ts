import { isTransientError } from '../utils/retry';
import {
  MailerConnectionError,
  MailerError,
  MailerRecipientsRejectedError,
  MailerSmtpError,
  MailerTimeoutError,
} from './mailer.errors';

const CONNECTION_CODES = new Set([
  'ECONNECTION',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/** Fields nodemailer errors carry, kept on the typed error for existing checks */
const PASSTHROUGH = [
  'responseCode',
  'response',
  'command',
  'rejected',
  'rejectedErrors',
];

/**
 * Turns whatever a transport threw into a `MailerError`, keeping the original
 * as `cause` and its fields. A `MailerError` is returned as is.
 */
export function toMailerError(error: unknown): MailerError {
  if (error instanceof MailerError) return error;
  const source = (
    typeof error === 'object' && error !== null ? error : {}
  ) as Record<string, any>;
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const code = typeof source.code === 'string' ? source.code : undefined;

  let typed: MailerError;
  if (typeof source.responseCode === 'number') {
    const init = {
      responseCode: source.responseCode,
      response:
        typeof source.response === 'string' ? source.response : undefined,
      command: typeof source.command === 'string' ? source.command : undefined,
      code,
      cause: error,
    };
    typed =
      code === 'EENVELOPE' &&
      Array.isArray(source.rejected) &&
      source.rejected.length > 0
        ? new MailerRecipientsRejectedError(message, {
            ...init,
            rejected: source.rejected,
          })
        : new MailerSmtpError(message, init);
  } else if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    typed = new MailerTimeoutError(message, { cause: error });
  } else if (code !== undefined && CONNECTION_CODES.has(code)) {
    typed = new MailerConnectionError(message, {
      code,
      cause: error,
      // A certificate that doesn't verify won't verify on the next attempt
      permanent: code === 'ETLS' && /certificate/i.test(message),
    });
  } else {
    typed = new MailerError(message, {
      permanent: !isTransientError(error),
      code,
      cause: error,
    });
  }

  for (const key of PASSTHROUGH) {
    if (key in source && !(key in typed)) {
      Object.defineProperty(typed, key, {
        value: source[key],
        enumerable: true,
      });
    }
  }
  if (typeof source.retryAfterMs === 'number' && !('retryAfterMs' in typed)) {
    Object.defineProperty(typed, 'retryAfterMs', {
      value: source.retryAfterMs,
      enumerable: true,
    });
  }
  if (error instanceof Error && error.stack) {
    typed.stack = `${typed.name}: ${message}\n    [cause] ${error.stack}`;
  }
  return typed;
}
