import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import {
  buildRaw,
  CapturedMail,
  LOCAL_TRANSPORT,
  NodemailerMail,
} from './captured-mail';

export interface FileTransportOptions {
  /** Where `.eml` files are written (default: `var/mail`), created when missing */
  directory?: string;
  /** Also write the HTML body next to the `.eml`, to open in a browser (default: true) */
  html?: boolean;
  /** Log the path of every file written (default: true) */
  log?: boolean;
}

/**
 * A development transport that writes every email to an `.eml` file (open it
 * with any mail client) instead of sending it.
 *
 * @example MailerModule.forRoot({ transport: new FileTransport({ directory: 'var/mail' }) })
 */
export class FileTransport {
  readonly name = 'FileTransport';
  readonly [LOCAL_TRANSPORT] = true;
  readonly version = '1.0.0';
  private readonly logger = new Logger(FileTransport.name);
  private readonly directory: string;

  constructor(private readonly options: FileTransportOptions = {}) {
    this.directory = path.resolve(options.directory ?? 'var/mail');
  }

  /** @internal Called by nodemailer */
  send(
    mail: NodemailerMail,
    // `any`: assignable to the callback types of every nodemailer major
    callback: (err: any, info?: any) => void,
  ): void {
    this.write(mail).then(
      (info) => callback(null, info),
      (err) => callback(err),
    );
  }

  private async write(mail: NodemailerMail): Promise<Record<string, any>> {
    const raw = await buildRaw(mail);
    const captured = new CapturedMail(mail, raw);
    const stamp = captured.sentAt.toISOString().replace(/[:.]/g, '-');
    const id = captured.messageId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
    const base = path.join(this.directory, `${stamp}-${id}`);

    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(`${base}.eml`, raw);
    if (this.options.html !== false && captured.html) {
      await fs.writeFile(`${base}.html`, captured.html);
    }
    if (this.options.log !== false) {
      this.logger.log(
        `"${captured.subject}" to ${captured.envelope.to.join(', ')} written to ${base}.eml`,
      );
    }
    return {
      envelope: captured.envelope,
      messageId: captured.messageId,
      accepted: captured.envelope.to,
      rejected: [],
      response: `Written to ${base}.eml`,
      path: `${base}.eml`,
    };
  }
}
