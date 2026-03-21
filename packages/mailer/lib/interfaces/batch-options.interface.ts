import { SentMessageInfo } from 'nodemailer';
import { ISendMailOptions } from './send-mail-options.interface';

/**
 * Options for batch email sending.
 */
export interface BatchMailOptions {
  /** Array of individual mail options */
  messages: ISendMailOptions[];
  /** Maximum number of concurrent sends (default: 5) */
  concurrency?: number;
  /** Whether to stop sending on first error (default: false) */
  stopOnError?: boolean;
}

/**
 * Result of a single email in a batch.
 */
export interface BatchItemResult {
  /** Index of the message in the original array */
  index: number;
  /** Whether the send was successful */
  success: boolean;
  /** The nodemailer result (on success) */
  result?: SentMessageInfo;
  /** The error (on failure) */
  error?: Error;
}

/**
 * Aggregate result of a batch send operation.
 */
export interface BatchResult {
  /** Total number of messages attempted */
  total: number;
  /** Number of successfully sent messages */
  sent: number;
  /** Number of failed messages */
  failed: number;
  /** Individual results for each message */
  results: BatchItemResult[];
}
