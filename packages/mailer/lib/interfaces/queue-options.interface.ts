/**
 * Configuration options for the mailer queue module.
 */
export interface MailerQueueOptions {
  /** Redis connection options for BullMQ */
  connection: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    [key: string]: any;
  };

  /** Default job options applied to all enqueued emails */
  defaultJobOptions?: {
    /** Number of retry attempts (default: 3) */
    attempts?: number;
    /** Backoff strategy */
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    /** Remove job on completion */
    removeOnComplete?: boolean | number;
    /** Remove job on failure */
    removeOnFail?: boolean | number;
    /** Job priority (lower = higher priority) */
    priority?: number;
    /** Delay before processing (ms) */
    delay?: number;
  };

  /** Queue name (default: 'mailer') */
  queueName?: string;
}
