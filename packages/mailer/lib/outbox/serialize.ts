import type { Type } from '@nestjs/common';
import type { Mailable } from '../interfaces/mailable.interface';
import { MAILER_OUTBOX_PAYLOAD_VERSION } from './mailer-outbox.constants';
import type {
  MailerOutboxMail,
  MailerOutboxPayload,
} from './mailer-outbox.interfaces';

/** How a binary value outside an attachment's content is stored (base64) */
export const BUFFER_TAG = '$mailerBuffer';

/** Options that only make sense in the process that sends */
const PROCESS_ONLY: Record<string, string> = {
  signal:
    'is an AbortSignal, which cannot be stored: the outbox handler passes the relay’s',
  retry:
    'cannot be stored: the outbox retries the message (`retry` of OutboxModule), so each attempt sends once',
};

function unstorable(path: string, reason: string): TypeError {
  return new TypeError(`MailerOutbox: ${path} ${reason}`);
}

function isBinary(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function base64(value: Uint8Array): string {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
    'base64',
  );
}

/**
 * The JSON snapshot of `value`: binary values become `{ $mailerBuffer: base64 }`,
 * `toJSON()` is honored (dates become ISO strings), `undefined` properties are
 * dropped. Anything JSON would lose or mangle is refused with a `TypeError`
 * naming its path: functions, symbols, bigints, non-finite numbers, streams,
 * maps, sets and cycles.
 */
export function toStorable(
  value: unknown,
  path: string,
  seen: Set<object> = new Set(),
): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw unstorable(path, `is ${value}, which JSON cannot hold`);
      }
      return value;
    case 'object':
      break;
    default:
      throw unstorable(path, `is a ${typeof value}, which cannot be stored`);
  }

  if (isBinary(value)) return { [BUFFER_TAG]: base64(value) };
  const object = value as Record<string, any>;
  if (typeof object.pipe === 'function') {
    throw unstorable(
      path,
      'is a stream, which cannot be stored: pass a Buffer, a string, or a `path`/`href` read when the email is sent',
    );
  }
  if (value instanceof Map || value instanceof Set) {
    throw unstorable(
      path,
      `is a ${value.constructor.name}, which JSON cannot hold: use an array or a plain object`,
    );
  }
  if (typeof object.toJSON === 'function') {
    return toStorable(object.toJSON(), path, seen);
  }
  if (seen.has(object)) {
    throw unstorable(path, 'is circular, which JSON cannot hold');
  }

  seen.add(object);
  try {
    if (Array.isArray(object)) {
      // Like JSON: an `undefined` element becomes null
      return object.map(
        (item, index) => toStorable(item, `${path}[${index}]`, seen) ?? null,
      );
    }
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(object)) {
      const stored = toStorable(item, `${path}.${key}`, seen);
      if (stored !== undefined) result[key] = stored;
    }
    return result;
  } finally {
    seen.delete(object);
  }
}

/** The inverse of `toStorable()`: brings the binary values back as Buffers */
export function fromStorable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromStorable);
  if (value === null || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (
    keys.length === 1 &&
    keys[0] === BUFFER_TAG &&
    typeof object[BUFFER_TAG] === 'string'
  ) {
    return Buffer.from(object[BUFFER_TAG] as string, 'base64');
  }
  return Object.fromEntries(
    keys.map((key) => [key, fromStorable(object[key])]),
  );
}

/** Binary content as base64 text nodemailer decodes itself (`encoding: 'base64'`) */
function encodeContent<T>(part: T): T {
  const content = (part as { content?: unknown } | undefined)?.content;
  if (!isBinary(content)) return part;
  return { ...part, content: base64(content), encoding: 'base64' };
}

function storableOptions(
  options: Record<string, any>,
  path: string,
): Record<string, unknown> {
  for (const [key, reason] of Object.entries(PROCESS_ONLY)) {
    if (options[key] !== undefined) {
      throw unstorable(`${path}.${key}`, reason);
    }
  }
  // `mailable` is set internally by `send(MailClass)`; the class is stored by name
  const { mailable: _mailable, attachments, icalEvent, ...rest } = options;
  return toStorable(
    {
      ...rest,
      attachments: Array.isArray(attachments)
        ? attachments.map(encodeContent)
        : attachments,
      icalEvent: encodeContent(icalEvent),
    },
    path,
  ) as Record<string, unknown>;
}

/**
 * The payload `MailerOutbox.add()` stores: send options, or a mail class by its
 * name in `mailables` with its options.
 */
export function toOutboxPayload(
  mail: MailerOutboxMail,
  names: Map<Type<Mailable<any>>, string>,
): MailerOutboxPayload {
  if (mail === null || typeof mail !== 'object' || Array.isArray(mail)) {
    throw new TypeError(
      'MailerOutbox.add() needs send options, or `{ mail: MailClass, to, data, ... }`',
    );
  }
  const { mail: mailClass, ...options } = mail as Record<string, any>;
  if (mailClass === undefined) {
    return {
      v: MAILER_OUTBOX_PAYLOAD_VERSION,
      mail: storableOptions(mail, 'mail'),
    };
  }
  if (typeof mailClass !== 'function') {
    throw new TypeError(
      'MailerOutbox: `mail` must be a mail class (one listed in `mailables`)',
    );
  }
  const name = names.get(mailClass);
  if (name === undefined) {
    throw new TypeError(
      `MailerOutbox: ${mailClass.name || 'the mail class'} is not in MailerOutboxModule's \`mailables\`, so the handler could not find it`,
    );
  }
  return {
    v: MAILER_OUTBOX_PAYLOAD_VERSION,
    mailable: name,
    options: storableOptions(options, 'options'),
  };
}
