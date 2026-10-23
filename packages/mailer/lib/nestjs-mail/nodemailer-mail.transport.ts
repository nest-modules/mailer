import { SentMessageInfo, Transporter } from 'nodemailer';
import { TransportType } from '../interfaces/mailer-options.interface';
import { MailerTransportFactory } from '../mailer-transport.factory';
import { isTransientError, raceSignal } from '../utils/retry';
import type {
  MailMessageLike,
  MailTransportLike,
  MailTransportResultLike,
  MailTransportSendOptionsLike,
} from './nestjs-mail.types';

function isTransporter(value: unknown): value is Transporter {
  return typeof (value as Transporter)?.sendMail === 'function';
}

/**
 * Marks an error with `permanent`, which `@nestjs/mail` reads to decide whether
 * to retry. Nodemailer's SMTP replies, network codes and HTTP statuses are
 * understood.
 */
export function classifyError(error: unknown): unknown {
  if (error && typeof error === 'object' && !('permanent' in error)) {
    Object.defineProperty(error, 'permanent', {
      value: !isTransientError(error),
      enumerable: true,
    });
  }
  return error;
}

/** Translates a nodemailer result for `@nestjs/mail` */
export function toTransportResult(
  info: SentMessageInfo,
): MailTransportResultLike {
  // Stream and JSON transports report no `accepted`: the envelope is what
  // was delivered (after interception or suppression)
  const list = Array.isArray(info?.accepted)
    ? info.accepted
    : Array.isArray(info?.envelope?.to)
      ? info.envelope.to
      : undefined;
  const accepted = list?.map((a: string | { address: string }) =>
    typeof a === 'string' ? a : a.address,
  );
  return {
    accepted,
    providerMessageId: info?.messageId,
    response: info?.response,
  };
}

/**
 * A `@nestjs/mail` transport that delivers through nodemailer: any nodemailer
 * transport (SMTP pools, SES SDK v3, sendmail, streams, community transports
 * such as Mailgun or Brevo) or an existing `Transporter`.
 *
 * The message is sent exactly as `@nestjs/mail` built it (`raw` MIME and SMTP
 * envelope), so its `Message-ID`, DKIM and Bcc handling are kept.
 *
 * @example
 * ```typescript
 * MailModule.forRoot({
 *   transport: new NodemailerMailTransport({ host: 'smtp.example.com', port: 587 }),
 *   from: 'App <app@example.com>',
 * })
 * ```
 */
export class NodemailerMailTransport implements MailTransportLike {
  readonly transporter: Transporter;

  constructor(transport: TransportType | Transporter) {
    this.transporter = isTransporter(transport)
      ? transport
      : new MailerTransportFactory({}).createTransport(transport);
  }

  async send(
    message: MailMessageLike,
    options: MailTransportSendOptionsLike,
  ): Promise<MailTransportResultLike> {
    try {
      const info = await raceSignal(
        this.transporter.sendMail({
          envelope: message.envelope,
          raw: message.toMime(),
          // Else nodemailer reports an id of its own, not the one in `raw`
          messageId: message.messageId,
        }),
        options.signal,
      );
      return toTransportResult(info);
    } catch (error) {
      throw classifyError(error);
    }
  }

  /** Checks the connection and credentials, for health checks */
  async verify(): Promise<boolean> {
    if (typeof this.transporter.verify !== 'function') return true;
    return this.transporter.verify().then(
      () => true,
      () => false,
    );
  }

  close(): void {
    this.transporter.close?.();
  }
}
