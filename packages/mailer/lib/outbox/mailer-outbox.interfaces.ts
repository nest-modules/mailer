import type { Type } from '@nestjs/common';
import type { NewOutboxMessage } from '@nestjs/outbox';
import type {
  Mailable,
  MailableData,
  MailableSendOptions,
} from '../interfaces/mailable.interface';
import type { ISendMailOptions } from '../interfaces/send-mail-options.interface';

/** The mail classes the outbox handler may render, by the name stored in the message */
export type MailerOutboxMailables =
  | Type<Mailable<any>>[]
  | Record<string, Type<Mailable<any>>>;

export interface MailerOutboxModuleOptions {
  /** The outbox topic emails are recorded under. Default `'mailer.send'`. */
  topic?: string;
  /**
   * The handler's inbox identity (`@OnOutboxMessage(topic, { consumer })`). Keep it
   * stable: a new name makes every past message look unprocessed. Default `'mailer'`.
   */
  consumer?: string;
  /**
   * Skip messages the handler already sent, recording each one after it succeeds.
   * Default `true` (the `@nestjs/outbox` default).
   */
  inbox?: boolean;
  /**
   * The mail classes `MailerOutbox.add(tx, { mail: WelcomeMail, ... })` may record.
   * An array stores each class under its `name`; a record under its key, which
   * survives class renames and minification.
   */
  mailables?: MailerOutboxMailables;
  /** Register `MailerOutbox` globally. Default `false`. */
  global?: boolean;
}

/** @internal The options with defaults applied and the mail classes indexed */
export interface ResolvedMailerOutboxOptions {
  topic: string;
  consumer: string;
  inbox: boolean;
  /** Stored name → class */
  mailables: Map<string, Type<Mailable<any>>>;
  /** Class → stored name */
  names: Map<Type<Mailable<any>>, string>;
}

/**
 * A mail class to render when the message is delivered: `{ mail: WelcomeMail,
 * to, data, locale, ... }`, the same options as `mailerService.send(WelcomeMail, ...)`.
 */
export type MailerOutboxMailable<M extends Mailable<any> = Mailable<any>> = {
  mail: Type<M>;
} & MailableSendOptions<MailableData<M>>;

/** What `MailerOutbox.add()` records: send options, or a mail class with its options */
export type MailerOutboxMail = ISendMailOptions | MailerOutboxMailable<any>;

/**
 * Message options passed through to `Outbox.add()`: `key` (per-key ordering), `id`,
 * `headers`, `delay` or `availableAt`.
 */
export type MailerOutboxAddOptions = Omit<
  NewOutboxMessage<unknown>,
  'topic' | 'payload'
>;

/** The JSON payload stored in the outbox for an email written inline */
export interface MailerOutboxMailPayload {
  v: 1;
  mail: Record<string, unknown>;
}

/** The JSON payload stored in the outbox for an email rendered by a mail class */
export interface MailerOutboxMailablePayload {
  v: 1;
  /** The class's name in `mailables` */
  mailable: string;
  options: Record<string, unknown>;
}

export type MailerOutboxPayload =
  | MailerOutboxMailPayload
  | MailerOutboxMailablePayload;
