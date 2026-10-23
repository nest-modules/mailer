import { Type } from '@nestjs/common';
import { addressesOf } from '../utils/recipients';

/** Marks transports that never deliver email (files, logs, memory) */
export const LOCAL_TRANSPORT = Symbol.for(
  '@nestjs-modules/mailer:local-transport',
);

/** What a nodemailer transport receives: the mail data and its MIME tree */
export interface NodemailerMail {
  data: Record<string, any>;
  message: {
    build(callback: (err: Error | null, message: Buffer) => void): void;
    getEnvelope(): { from: string | false; to: string[] };
    messageId(): string;
  };
}

/** Builds the raw MIME source of a mail, as it would go on the wire */
export function buildRaw(mail: NodemailerMail): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    mail.message.build((err, raw) => (err ? reject(err) : resolve(raw))),
  );
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|#x27);/g,
    (entity) => ENTITIES[entity],
  );
}

/** Decodes RFC 2047 encoded words (`=?UTF-8?B?…?=`, `=?UTF-8?Q?…?=`) */
function decodeWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(
      /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
      (_, charset: string, encoding: string, text: string) => {
        const bytes =
          encoding.toUpperCase() === 'B'
            ? Buffer.from(text, 'base64')
            : Buffer.from(
                text
                  .replace(/_/g, ' ')
                  .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
                    String.fromCharCode(Number.parseInt(hex, 16)),
                  ),
                'latin1',
              );
        return bytes.toString(/^utf-?8$/i.test(charset) ? 'utf-8' : 'latin1');
      },
    );
}

/** A header of a raw MIME message (unfolded and decoded), for emails sent as `raw` */
export function rawHeader(raw: string, name: string): string | undefined {
  const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const prefix = `${name.toLowerCase()}:`;
  const line = head
    .split(/\r?\n/)
    .find((l) => l.toLowerCase().startsWith(prefix));
  return line === undefined
    ? undefined
    : decodeWords(line.slice(prefix.length).trim());
}

function bodyText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  return undefined;
}

/**
 * An email captured by `TestMailbox` or `FileTransport`: the fields as sent,
 * after templates were rendered, plus the raw MIME source.
 */
export class CapturedMail {
  readonly messageId: string;
  readonly from: string | undefined;
  readonly to: string[];
  readonly cc: string[];
  readonly bcc: string[];
  readonly subject: string | undefined;
  readonly html: string | undefined;
  readonly text: string | undefined;
  readonly template: string | undefined;
  readonly context: Record<string, any> | undefined;
  readonly locale: string | undefined;
  readonly headers:
    | Record<string, any>
    | Array<{ key: string; value: string }>
    | undefined;
  readonly attachments: Array<Record<string, any>>;
  /** The mail class that rendered it, when it was sent with `send(MailClass)` */
  readonly mailable: Type<unknown> | undefined;
  /** Every recipient on the SMTP envelope (to, cc and bcc) */
  readonly envelope: { from: string | false; to: string[] };
  /** The MIME source, as an `.eml` file holds it */
  readonly raw: string;
  readonly sentAt: Date;

  constructor(mail: NodemailerMail, raw: Buffer) {
    const { data } = mail;
    this.raw = raw.toString('utf-8');
    // A raw message (from @nestjs/mail, for instance) carries its fields in the MIME
    const field = (name: string) =>
      data[name.toLowerCase()] ??
      (data.raw ? rawHeader(this.raw, name) : undefined);
    this.messageId = mail.message.messageId();
    this.from = addressesOf(field('From'))[0];
    this.to = addressesOf(field('To'));
    this.cc = addressesOf(field('Cc'));
    this.bcc = addressesOf(data.bcc);
    this.subject = field('Subject');
    this.html = bodyText(data.html);
    this.text = bodyText(data.text);
    this.template = data.template;
    this.context = data.context;
    this.locale = data.locale;
    this.headers = data.headers;
    this.attachments = data.attachments ?? [];
    this.mailable = data.mailable;
    this.envelope = mail.message.getEnvelope();
    this.sentAt = new Date();
  }

  /** Every `href` in the HTML body, entities decoded */
  get links(): string[] {
    if (!this.html) return [];
    return [...this.html.matchAll(/href\s*=\s*(["'])(.*?)\1/gi)].map((match) =>
      decodeEntities(match[2]),
    );
  }

  /**
   * The first link containing `match` (or matching it, for a RegExp), parsed.
   * Throws when there is none, listing the links the email has.
   *
   * @example mail.link('/verify').searchParams.get('token')
   */
  link(match: string | RegExp): URL {
    const found = this.links.find((href) =>
      typeof match === 'string' ? href.includes(match) : match.test(href),
    );
    if (!found) {
      throw new Error(
        `No link matching ${String(match)} in "${this.subject}". Links: ${
          this.links.join(', ') || '(none)'
        }`,
      );
    }
    return new URL(found, 'http://localhost');
  }

  /** The attachment with this filename. Throws when there is none. */
  attachment(filename: string): Record<string, any> {
    const found = this.attachments.find((a) => a.filename === filename);
    if (!found) {
      throw new Error(
        `No attachment "${filename}" in "${this.subject}". Attachments: ${
          this.attachments.map((a) => a.filename).join(', ') || '(none)'
        }`,
      );
    }
    return found;
  }
}
