import { Logger, LoggerService } from '@nestjs/common';
import {
  buildRaw,
  CapturedMail,
  LOCAL_TRANSPORT,
  NodemailerMail,
} from './captured-mail';

export interface LogTransportOptions {
  /** Log the text body too (default: false) */
  body?: boolean;
  /** Where to log (default: a Nest `Logger` named `LogTransport`) */
  logger?: LoggerService;
}

/**
 * A development transport that logs every email instead of sending it.
 *
 * @example MailerModule.forRoot({ transport: new LogTransport({ body: true }) })
 */
export class LogTransport {
  readonly name = 'LogTransport';
  readonly [LOCAL_TRANSPORT] = true;
  readonly version = '1.0.0';
  private readonly logger: LoggerService;

  constructor(private readonly options: LogTransportOptions = {}) {
    this.logger = options.logger ?? new Logger(LogTransport.name);
  }

  /** @internal Called by nodemailer */
  send(
    mail: NodemailerMail,
    // `any`: assignable to the callback types of every nodemailer major
    callback: (err: any, info?: any) => void,
  ): void {
    buildRaw(mail).then(
      (raw) => {
        const captured = new CapturedMail(mail, raw);
        const lines = [
          `Email "${captured.subject}"`,
          `  from: ${captured.from}`,
          `  to: ${captured.envelope.to.join(', ')}`,
        ];
        if (captured.attachments.length > 0) {
          lines.push(
            `  attachments: ${captured.attachments.map((a) => a.filename ?? '(inline)').join(', ')}`,
          );
        }
        if (this.options.body && captured.text) {
          lines.push('', captured.text);
        }
        this.logger.log(lines.join('\n'));
        callback(null, {
          envelope: captured.envelope,
          messageId: captured.messageId,
          accepted: captured.envelope.to,
          rejected: [],
          response: '250 OK: logged by LogTransport',
        });
      },
      (err) => callback(err),
    );
  }
}
