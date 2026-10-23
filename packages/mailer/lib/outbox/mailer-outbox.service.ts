import type { Outbox, OutboxMessage } from '@nestjs/outbox';
import type { Mailable } from '../interfaces/mailable.interface';
import type { ISendMailOptions } from '../interfaces/send-mail-options.interface';
import type {
  MailerOutboxAddOptions,
  MailerOutboxMail,
  MailerOutboxMailable,
  MailerOutboxPayload,
  ResolvedMailerOutboxOptions,
} from './mailer-outbox.interfaces';
import { toOutboxPayload } from './serialize';

/**
 * Records emails in the official `@nestjs/outbox`, in the caller's database
 * transaction: the email is sent only if the transaction commits, and is retried
 * by the outbox relay until it is delivered or dead-lettered.
 *
 * `MailerOutboxModule.register()` provides it, next to `OutboxModule.forRoot()`.
 *
 * @example
 * ```typescript
 * await db.transaction(async (tx) => {
 *   await tx.insert(users).values(user);
 *   await mailerOutbox.add(tx, { mail: WelcomeMail, to: user.email, data: user });
 * });
 * mailerOutbox.notify();
 * ```
 */
export class MailerOutbox<Tx = unknown> {
  constructor(
    private readonly outbox: Outbox<Tx>,
    private readonly options: ResolvedMailerOutboxOptions,
  ) {}

  /** The topic the emails are recorded under */
  get topic(): string {
    return this.options.topic;
  }

  /**
   * Writes the email through `tx`, your open transaction. Its data is stored as
   * JSON: Buffers in attachments become base64, and what JSON cannot hold
   * (streams, functions, an AbortSignal) is refused with a `TypeError`.
   *
   * The result is a promise only with an asynchronous store: await it like any
   * other query, before the transaction commits.
   */
  add<M extends Mailable<any>>(
    tx: Tx,
    mail: MailerOutboxMailable<M>,
    options?: MailerOutboxAddOptions,
  ):
    | OutboxMessage<MailerOutboxPayload>
    | Promise<OutboxMessage<MailerOutboxPayload>>;
  add(
    tx: Tx,
    mail: ISendMailOptions,
    options?: MailerOutboxAddOptions,
  ):
    | OutboxMessage<MailerOutboxPayload>
    | Promise<OutboxMessage<MailerOutboxPayload>>;
  add(
    tx: Tx,
    mail: MailerOutboxMail,
    options: MailerOutboxAddOptions = {},
  ):
    | OutboxMessage<MailerOutboxPayload>
    | Promise<OutboxMessage<MailerOutboxPayload>> {
    return this.outbox.add(tx, {
      ...options,
      topic: this.options.topic,
      payload: toOutboxPayload(mail, this.options.names),
    });
  }

  /** Polls the outbox now. Call it after your transaction commits to skip the poll interval. */
  notify(): void {
    this.outbox.notify();
  }
}
