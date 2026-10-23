import { createHash } from 'node:crypto';
import addressparser from 'nodemailer/lib/addressparser';
import { InterceptOptions } from '../interfaces/mailer-options.interface';
import {
  Address,
  ISendMailOptions,
  UnsubscribeOptions,
} from '../interfaces/send-mail-options.interface';

type AddressField = ISendMailOptions['to'];

const RECIPIENT_FIELDS = ['to', 'cc', 'bcc'] as const;

/** Every address in a `to`/`cc`/`bcc`-style field, as plain `user@domain` strings */
export function addressesOf(field: AddressField | string[]): string[] {
  if (field === undefined || field === null) return [];
  const items = Array.isArray(field) ? field : [field];
  return items.flatMap((item) => {
    if (typeof item === 'string') {
      return addressparser(item, { flatten: true })
        .map((parsed) => parsed.address)
        .filter(Boolean);
    }
    return item?.address ? [item.address] : [];
  });
}

/** Every address in a field as `{ name?, address }`, the shape `@nestjs/mail` uses */
export function parseAddresses(
  field: AddressField,
): Array<{ name?: string; address: string }> {
  if (field === undefined || field === null) return [];
  const items = Array.isArray(field) ? field : [field];
  return items.flatMap((item) => {
    const parsed =
      typeof item === 'string'
        ? addressparser(item, { flatten: true })
        : item?.address
          ? [item]
          : [];
    return parsed
      .filter((a) => a.address)
      .map((a) =>
        a.name ? { name: a.name, address: a.address } : { address: a.address },
      );
  });
}

/** Keeps the entries of an address field whose addresses pass `keep` */
async function filterField(
  field: NonNullable<AddressField>,
  keep: (address: string) => boolean | Promise<boolean>,
): Promise<Array<string | Address>> {
  const items = Array.isArray(field) ? field : [field];
  const kept: Array<string | Address> = [];
  for (const item of items) {
    if (typeof item === 'string') {
      for (const parsed of addressparser(item, { flatten: true })) {
        if (parsed.address && (await keep(parsed.address))) {
          kept.push(
            parsed.name
              ? { name: parsed.name, address: parsed.address }
              : parsed.address,
          );
        }
      }
    } else if (item?.address && (await keep(item.address))) {
      kept.push(item);
    }
  }
  return kept;
}

/** Applies `keep` to every recipient field, and to the envelope of raw messages */
async function filterRecipients(
  mail: ISendMailOptions,
  keep: (address: string) => boolean | Promise<boolean>,
): Promise<ISendMailOptions> {
  const result: ISendMailOptions = { ...mail };
  for (const field of RECIPIENT_FIELDS) {
    if (mail[field] !== undefined)
      result[field] = await filterField(mail[field], keep);
  }
  // A custom envelope is what nodemailer delivers to: all of its to, cc and bcc
  const envelope = envelopeOf(mail);
  if (envelope) {
    const filtered: Record<string, unknown> = { ...envelope };
    for (const field of RECIPIENT_FIELDS) {
      if (envelope[field] !== undefined) {
        filtered[field] = await filterField(envelope[field], keep);
      }
    }
    result.envelope = filtered as ISendMailOptions['envelope'];
  }
  return result;
}

type Envelope = Partial<
  Record<(typeof RECIPIENT_FIELDS)[number], AddressField>
>;

/** The custom envelope, when it names recipients */
function envelopeOf(mail: ISendMailOptions): Envelope | undefined {
  const envelope = mail.envelope as Envelope | undefined;
  return envelope && RECIPIENT_FIELDS.some((f) => envelope[f] !== undefined)
    ? envelope
    : undefined;
}

/** The recipients of an email: its header fields and, for raw messages, its envelope */
export function recipientsOf(mail: ISendMailOptions): string[] {
  const envelope = envelopeOf(mail) ?? {};
  return [
    ...RECIPIENT_FIELDS.flatMap((field) => addressesOf(mail[field])),
    ...RECIPIENT_FIELDS.flatMap((field) => addressesOf(envelope[field])),
  ];
}

/**
 * Drops the recipients `suppress` returns `true` for. Returns the email without
 * them and the dropped addresses.
 */
export async function applySuppression(
  mail: ISendMailOptions,
  suppress: (
    address: string,
    mail: ISendMailOptions,
  ) => boolean | Promise<boolean>,
): Promise<{ mail: ISendMailOptions; suppressed: string[] }> {
  const suppressed: string[] = [];
  const keep = async (address: string) => {
    if (await suppress(address, mail)) {
      suppressed.push(address);
      return false;
    }
    return true;
  };
  const result = await filterRecipients(mail, keep);
  return { mail: result, suppressed: [...new Set(suppressed)] };
}

function isAllowed(address: string, allow: Array<string | RegExp>): boolean {
  const lower = address.toLowerCase();
  return allow.some((rule) => {
    if (rule instanceof RegExp) return rule.test(address);
    const normalized = rule.toLowerCase();
    return normalized.startsWith('@')
      ? lower.endsWith(normalized)
      : lower === normalized;
  });
}

/**
 * Replaces every recipient not matching `allow` with the intercept address,
 * recording the original ones in an `X-Intercepted-Recipients` header.
 */
export async function applyIntercept(
  mail: ISendMailOptions,
  intercept: InterceptOptions,
): Promise<ISendMailOptions> {
  if (intercept.enabled === false) return mail;
  const allow = intercept.allow ?? [];
  const intercepted: string[] = [];
  const keep = (address: string) => {
    if (isAllowed(address, allow)) return true;
    intercepted.push(address);
    return false;
  };

  const result = await filterRecipients(mail, keep);
  if (intercepted.length === 0) return mail;

  const targets = Array.isArray(intercept.to) ? intercept.to : [intercept.to];
  result.to = [...((result.to as Array<string | Address>) ?? []), ...targets];
  // filterRecipients copied the envelope when it had recipients
  if (envelopeOf(mail)) {
    const envelope = result.envelope as Envelope;
    envelope.to = [
      ...((envelope.to as Array<string | Address>) ?? []),
      ...targets,
    ];
  }
  if (intercept.subjectPrefix && result.subject !== undefined) {
    result.subject = intercept.subjectPrefix + result.subject;
  }
  result.headers = withHeader(
    result.headers,
    'X-Intercepted-Recipients',
    [...new Set(intercepted)].join(', '),
  );
  return result;
}

/** Adds a header to nodemailer's object or array header formats */
export function withHeader(
  headers: ISendMailOptions['headers'],
  key: string,
  value: string,
): ISendMailOptions['headers'] {
  if (Array.isArray(headers)) return [...headers, { key, value }];
  return { ...headers, [key]: value };
}

/** Translates `unsubscribe` into nodemailer's `list` option and the one-click header */
export function applyUnsubscribe(
  mail: ISendMailOptions,
  unsubscribe: UnsubscribeOptions,
): ISendMailOptions {
  const links: string[] = [];
  if (unsubscribe.url) links.push(unsubscribe.url);
  if (unsubscribe.mailto) {
    links.push(
      unsubscribe.mailto.startsWith('mailto:')
        ? unsubscribe.mailto
        : `mailto:${unsubscribe.mailto}`,
    );
  }
  if (links.length === 0) {
    throw new TypeError('unsubscribe needs a `url`, a `mailto`, or both');
  }
  const { unsubscribe: _, ...rest } = mail;
  const result: ISendMailOptions = {
    ...rest,
    list: { ...(mail.list as object), unsubscribe: links },
  };
  const oneClick = unsubscribe.oneClick ?? Boolean(unsubscribe.url);
  if (oneClick) {
    if (!unsubscribe.url) {
      throw new TypeError('unsubscribe.oneClick needs an HTTPS `url`');
    }
    result.headers = withHeader(
      result.headers,
      'List-Unsubscribe-Post',
      'List-Unsubscribe=One-Click',
    );
  }
  return result;
}

/** A stable `Message-ID` for an idempotency key: the same key, the same id */
export function messageIdFor(
  idempotencyKey: string,
  from: ISendMailOptions['from'] | undefined,
): string {
  const hash = createHash('sha256')
    .update(idempotencyKey)
    .digest('hex')
    .slice(0, 32);
  const sender = addressesOf(from)[0];
  const domain = sender?.split('@')[1] || 'nestjs-mailer.local';
  return `<${hash}@${domain}>`;
}
