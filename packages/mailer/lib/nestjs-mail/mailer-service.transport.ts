import { Injectable, Type } from '@nestjs/common';
import { MailerService } from '../mailer.service';
import type {
  MailMessageLike,
  MailTransportLike,
  MailTransportResultLike,
  MailTransportSendOptionsLike,
} from './nestjs-mail.types';
import { classifyError, toTransportResult } from './nodemailer-mail.transport';

/**
 * A `@nestjs/mail` transport that delivers through this library's
 * `MailerService`, so `@nestjs/mail`'s typed mail classes and outbox get this
 * library's named transporters, failover, interception, suppression lists,
 * nodemailer plugins and events. Import `MailerModule` next to `MailModule`.
 *
 * Retries stay with `@nestjs/mail` (`retry` is turned off here, so attempts are
 * never multiplied); failover between transporters still happens.
 *
 * @example
 * ```typescript
 * MailerModule.forRoot({ transports: { ses: ..., smtp: ... }, failover: ['smtp'] }),
 * MailModule.forRoot({ transport: MailerServiceTransport.for('ses'), from: 'app@example.com' }),
 * ```
 */
@Injectable()
export class MailerServiceTransport implements MailTransportLike {
  /** The named transporter to use; the default one when undefined */
  protected readonly transporterName: string | undefined = undefined;

  constructor(private readonly mailerService: MailerService) {}

  /** A transport class bound to one of `MailerModule`'s named `transports` */
  static for(transporterName: string): Type<MailerServiceTransport> {
    @Injectable()
    class NamedMailerServiceTransport extends MailerServiceTransport {
      protected readonly transporterName = transporterName;
    }
    Object.defineProperty(NamedMailerServiceTransport, 'name', {
      value: `MailerServiceTransport(${transporterName})`,
    });
    return NamedMailerServiceTransport;
  }

  async send(
    message: MailMessageLike,
    options: MailTransportSendOptionsLike,
  ): Promise<MailTransportResultLike> {
    try {
      const info = await this.mailerService.sendMail({
        envelope: message.envelope,
        raw: message.toMime(),
        messageId: message.messageId,
        transporterName: this.transporterName,
        idempotencyKey: options.idempotencyKey,
        signal: options.signal,
        retry: false,
      });
      return toTransportResult(info);
    } catch (error) {
      throw classifyError(error);
    }
  }
}
