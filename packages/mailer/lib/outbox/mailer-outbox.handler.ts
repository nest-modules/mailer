import { Inject, Injectable, type Type } from '@nestjs/common';
import type { OutboxHandlerContext } from '@nestjs/outbox';
import type { SentMessageInfo } from 'nodemailer';
import type { ISendMailOptions } from '../interfaces/send-mail-options.interface';
import { MailerService } from '../mailer.service';
import { isTransientError } from '../utils/retry';
import type { OutboxModuleExports } from './load-outbox';
import { MAILER_OUTBOX_OPTIONS } from './mailer-outbox.constants';
import type {
  MailerOutboxPayload,
  ResolvedMailerOutboxOptions,
} from './mailer-outbox.interfaces';
import { fromStorable } from './serialize';

/** @internal Injection token of the loaded `@nestjs/outbox` exports */
export const MAILER_OUTBOX_PACKAGE = 'MAILER_OUTBOX_PACKAGE';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPayload(value: unknown): value is MailerOutboxPayload {
  if (!isRecord(value) || value.v !== 1) return false;
  return typeof value.mailable === 'string'
    ? isRecord(value.options)
    : isRecord(value.mail);
}

/**
 * Sends the emails `MailerOutbox` recorded, as an `@OnOutboxMessage()` handler
 * (`MailerOutboxModule.register()` builds a subclass bound to its topic).
 *
 * - The outbox message id is the `idempotencyKey`, so every redelivery carries
 *   the same `Message-ID` and mailbox providers can drop a duplicate.
 * - `retry` is off: the outbox owns the retries and their backoff.
 * - A permanent failure (SMTP 5xx, a bad template, an unknown mail class) throws
 *   `NonRetryableMessageError`, so the message is dead-lettered at once; a
 *   transient one is rethrown for the outbox to retry.
 */
@Injectable()
export class MailerOutboxHandler {
  constructor(
    protected readonly mailerService: MailerService,
    @Inject(MAILER_OUTBOX_OPTIONS)
    protected readonly options: ResolvedMailerOutboxOptions,
    @Inject(MAILER_OUTBOX_PACKAGE)
    protected readonly outbox: OutboxModuleExports,
  ) {}

  async handle(
    payload: unknown,
    context: OutboxHandlerContext,
  ): Promise<SentMessageInfo> {
    const { NonRetryableMessageError } = this.outbox;
    const { id } = context.message;
    if (!isPayload(payload)) {
      throw new NonRetryableMessageError(
        `MailerOutbox: message ${id} holds no email this version can read`,
      );
    }
    const delivery = { signal: context.signal, retry: false as const };

    let send: () => Promise<SentMessageInfo>;
    if ('mailable' in payload) {
      const mailClass = this.options.mailables.get(payload.mailable);
      if (!mailClass) {
        throw new NonRetryableMessageError(
          `MailerOutbox: message ${id} names the mail class "${payload.mailable}", which is not in MailerOutboxModule's \`mailables\``,
        );
      }
      const options = fromStorable(payload.options) as Record<string, unknown>;
      send = () =>
        this.mailerService.send(mailClass, {
          idempotencyKey: id,
          ...options,
          ...delivery,
        } as any);
    } else {
      const mail = fromStorable(payload.mail) as ISendMailOptions;
      send = () =>
        this.mailerService.sendMail({
          idempotencyKey: id,
          ...mail,
          ...delivery,
        });
    }

    try {
      return await send();
    } catch (error) {
      if (isTransientError(error)) throw error;
      throw new NonRetryableMessageError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }
}

/**
 * A handler class of its own for `topic`: `@OnOutboxMessage()` keeps its metadata
 * on the method, so each registration needs its own method to decorate.
 */
export function createMailerOutboxHandler(
  outbox: OutboxModuleExports,
  options: Pick<ResolvedMailerOutboxOptions, 'topic' | 'consumer' | 'inbox'>,
): Type<MailerOutboxHandler> {
  @Injectable()
  class MailerOutboxMessageHandler extends MailerOutboxHandler {
    override handle(
      payload: unknown,
      context: OutboxHandlerContext,
    ): Promise<SentMessageInfo> {
      return super.handle(payload, context);
    }
  }

  const { prototype } = MailerOutboxMessageHandler;
  const decorator = outbox.OnOutboxMessage(options.topic, {
    consumer: options.consumer,
    inbox: options.inbox,
  });
  Object.defineProperty(
    prototype,
    'handle',
    Reflect.decorate(
      [decorator],
      prototype,
      'handle',
      Object.getOwnPropertyDescriptor(prototype, 'handle'),
    ) as PropertyDescriptor,
  );
  return MailerOutboxMessageHandler;
}
