import addressparser from 'nodemailer/lib/addressparser';
import { MailerMessageError } from '../errors/mailer.errors';
import { ISendMailOptions } from '../interfaces/send-mail-options.interface';

const ADDRESS_FIELDS = [
  'from',
  'sender',
  'to',
  'cc',
  'bcc',
  'replyTo',
] as const;
/** A pragmatic address check: something@domain, no spaces or line breaks */
const ADDRESS = /^[^\s@]+@[^\s@]+$/;
/** RFC 5322 header names: printable ASCII except the colon */
const HEADER_NAME = /^[\x21-\x39\x3b-\x7e]+$/;
const LINE_BREAK = /[\r\n]/;

function checkAddress(field: string, address: string): void {
  if (!ADDRESS.test(address)) {
    throw new MailerMessageError(
      `Invalid address in \`${field}\`: "${address}"`,
      {
        field,
      },
    );
  }
}

function checkField(field: string, value: unknown): void {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (typeof item === 'string') {
      if (LINE_BREAK.test(item)) {
        throw new MailerMessageError(`\`${field}\` contains a line break`, {
          field,
        });
      }
      for (const parsed of addressparser(item, { flatten: true })) {
        checkAddress(field, parsed.address);
      }
    } else if (item && typeof item === 'object') {
      const { address, name } = item as { address?: unknown; name?: unknown };
      if (typeof name === 'string' && LINE_BREAK.test(name)) {
        throw new MailerMessageError(
          `A name in \`${field}\` contains a line break`,
          {
            field,
          },
        );
      }
      checkAddress(field, String(address ?? ''));
    }
  }
}

/**
 * Rejects what would fail at the server or open a header injection, before
 * anything is sent: malformed addresses, line breaks in addresses, the subject
 * or custom headers, and invalid header names. Throws `MailerMessageError`.
 */
export function validateMessage(mail: ISendMailOptions): void {
  for (const field of ADDRESS_FIELDS) {
    if (mail[field] !== undefined && mail[field] !== null)
      checkField(field, mail[field]);
  }
  if (typeof mail.subject === 'string' && LINE_BREAK.test(mail.subject)) {
    throw new MailerMessageError('`subject` contains a line break', {
      field: 'subject',
    });
  }
  const headers = mail.headers;
  const entries = Array.isArray(headers)
    ? headers.map((h) => [h.key, h.value] as const)
    : Object.entries(headers ?? {});
  for (const [key, value] of entries) {
    if (!HEADER_NAME.test(key)) {
      throw new MailerMessageError(`Invalid header name "${key}"`, {
        field: 'headers',
      });
    }
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      // Prepared values are written as given by design (nodemailer's escape hatch)
      const text =
        typeof v === 'object' && v !== null ? (v.prepared ? '' : v.value) : v;
      if (typeof text === 'string' && LINE_BREAK.test(text)) {
        throw new MailerMessageError(`Header "${key}" contains a line break`, {
          field: 'headers',
        });
      }
    }
  }
}
