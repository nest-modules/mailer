/**
 * How failed sends are retried. Only transient failures (timeouts, dropped
 * connections, 4xx SMTP replies, HTTP 429/5xx) are retried; permanent ones
 * (5xx SMTP replies, bad recipients, template errors) fail immediately.
 */
export interface MailerRetryOptions {
  /** Total attempts, including the first one (default: 3) */
  attempts?: number;
  /**
   * Exponential backoff between attempts, or a function returning the delay in
   * milliseconds for a failed attempt (1-based).
   * Defaults: `delay` 1000ms, `factor` 2, `maxDelay` 30000ms, `jitter` 'full'.
   */
  backoff?:
    | {
        delay?: number;
        factor?: number;
        maxDelay?: number;
        jitter?: 'full' | 'equal' | 'none';
      }
    | ((attempt: number, error: unknown) => number);
  /**
   * Narrows which transient errors are retried. Permanent errors are never
   * retried, whatever this returns.
   */
  retryIf?: (error: unknown, attempt: number) => boolean;
}
