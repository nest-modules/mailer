import {
  MailerConnectionError,
  MailerMessageError,
  MailerProviderError,
  MailerTimeoutError,
} from '../../errors/mailer.errors';
import { NodemailerMail } from '../captured-mail';
import { parseRetryAfter } from './retry-after';

/** Options every HTTP email-API transport takes */
export interface HttpTransportOptions {
  /** The API's base URL, to target a region, a proxy or a mock server. Must be https (or localhost). */
  baseUrl?: string;
  /** Per request, in milliseconds. Default 30000. */
  timeout?: number;
  /** Replaces the global `fetch`, e.g. with a stub in tests */
  fetch?: typeof globalThis.fetch;
}

/** What nodemailer hands a transport, with `normalize()` for the JSON APIs */
export interface HttpMail extends NodemailerMail {
  normalize(callback: (err: Error | null, data?: any) => void): void;
}

export interface HttpAddress {
  name: string;
  address: string;
}

export interface HttpAttachment {
  filename: string;
  /** Base64 */
  content: string;
  contentType: string;
  /** The `cid:` an HTML body refers to, for inline images */
  cid?: string;
  inline: boolean;
}

/** A message as JSON email APIs take it: addresses parsed, every content resolved */
export interface NormalizedMail {
  from: HttpAddress;
  to: HttpAddress[];
  cc: HttpAddress[];
  bcc: HttpAddress[];
  replyTo: HttpAddress[];
  subject: string;
  text?: string;
  html?: string;
  /** Custom headers, including `List-*`, `References` and `In-Reply-To` */
  headers: Record<string, string>;
  attachments: HttpAttachment[];
  envelope: { from: string | false; to: string[] };
  messageId: string;
  idempotencyKey?: string;
}

export interface ProviderResponse {
  status: number;
  headers: Headers;
  /** Parsed JSON, the text when it isn't JSON, `undefined` when empty */
  body: unknown;
}

/** How a provider describes a refusal */
export interface ProviderErrorDetails {
  code?: string;
  message?: string;
  /** Overrides the classification by HTTP status */
  permanent?: boolean;
}

/** What a transport reports to nodemailer (and `MailerService`) */
export interface HttpSentMessageInfo {
  /** The provider's id for the message, or the message's own `Message-ID` */
  messageId: string;
  /** The provider's id, when it returned one */
  providerMessageId?: string;
  envelope: { from: string | false; to: string[] };
  accepted: string[];
  rejected: string[];
  response: string;
}

interface ProviderInfo {
  /** The transport's name, as nodemailer reports it */
  name: string;
  /** Lowercase id, used as `MailerProviderError.provider` */
  provider: string;
  /** Display name, used in messages */
  label: string;
  defaultBaseUrl: string;
}

const DEFAULT_TIMEOUT = 30_000;
/** Enough of a provider's error text for any message */
const MAX_DETAIL = 500;

/**
 * The shared request path of the HTTP email-API transports: a nodemailer
 * custom transport (`name`, `version`, `send(mail, callback)`) that POSTs to
 * a provider with `fetch`, and fails with the mailer's typed errors so
 * `MailerService` retries and fails over by their `permanent` flag:
 * - a refusal is a `MailerProviderError` (with `retryAfterMs` from `Retry-After`),
 * - no answer within `timeout` is a `MailerTimeoutError`,
 * - a network failure is a `MailerConnectionError`.
 */
export abstract class HttpProviderTransport {
  readonly name: string;
  readonly version = '1.0.0';
  protected readonly provider: string;
  protected readonly label: string;
  protected readonly baseUrl: string;
  protected readonly timeout: number;
  private readonly fetcher?: typeof globalThis.fetch;

  protected constructor(info: ProviderInfo, options: HttpTransportOptions) {
    this.name = info.name;
    this.provider = info.provider;
    this.label = info.label;
    const owner = info.name;
    if (!options || typeof options !== 'object') {
      throw new TypeError(`${owner} needs options`);
    }
    this.baseUrl = checkBaseUrl(options.baseUrl ?? info.defaultBaseUrl, owner);
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new TypeError(
        `${owner} \`timeout\` must be a positive number of milliseconds`,
      );
    }
    this.timeout = timeout;
    if (options.fetch !== undefined && typeof options.fetch !== 'function') {
      throw new TypeError(`${owner} \`fetch\` must be a function`);
    }
    this.fetcher = options.fetch;
  }

  /** @internal Called by nodemailer */
  send(
    mail: HttpMail,
    // `any`: assignable to the callback types of every nodemailer major
    callback: (err: any, info?: any) => void,
  ): void {
    this.deliver(mail).then(
      (info) => callback(null, info),
      (err) => callback(err),
    );
  }

  /** Sends one message to the provider */
  protected abstract deliver(mail: HttpMail): Promise<HttpSentMessageInfo>;

  /** Reads the provider's error code and message from a refusal */
  protected errorDetails({ body }: ProviderResponse): ProviderErrorDetails {
    return {
      code: field(body, 'code', 'name', 'ErrorCode'),
      message: field(body, 'message', 'Message', 'error'),
    };
  }

  /** POSTs to the provider; a non-2xx answer throws a `MailerProviderError` */
  protected async request(
    url: string,
    init: { headers: Record<string, string>; body: string | FormData },
  ): Promise<ProviderResponse> {
    const signal = AbortSignal.timeout(this.timeout);
    const fetch = this.fetcher ?? globalThis.fetch;
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        signal,
        redirect: 'error',
      });
      text = await response.text();
    } catch (error) {
      throw this.networkError(error, signal, url);
    }
    const result: ProviderResponse = {
      status: response.status,
      headers: response.headers,
      body: parseBody(text),
    };
    if (!response.ok) throw this.refusal(result);
    return result;
  }

  /** What nodemailer gets back once the provider accepted the message */
  protected sent(
    mail: NodemailerMail,
    response: ProviderResponse,
    providerMessageId: string | undefined,
  ): HttpSentMessageInfo {
    const envelope = mail.message.getEnvelope();
    return {
      messageId: providerMessageId ?? mail.message.messageId(),
      ...(providerMessageId !== undefined && { providerMessageId }),
      envelope,
      accepted: envelope.to,
      rejected: [],
      response: `${this.label} ${response.status}${
        providerMessageId === undefined ? '' : ` ${providerMessageId}`
      }`,
    };
  }

  /** A message error naming this provider */
  protected messageError(field: string, problem: string): MailerMessageError {
    return new MailerMessageError(`${this.label} ${problem}`, { field });
  }

  private refusal(response: ProviderResponse): MailerProviderError {
    const details = this.errorDetails(response);
    const detail =
      details.message ??
      (typeof response.body === 'string' ? response.body : undefined);
    const code = details.code === undefined ? '' : ` ${details.code}`;
    return new MailerProviderError(
      `${this.label} refused the email (HTTP ${response.status}${code})${
        detail ? `: ${detail.slice(0, MAX_DETAIL)}` : ''
      }`,
      {
        provider: this.provider,
        status: response.status,
        providerCode: details.code,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        permanent: details.permanent,
      },
    );
  }

  private networkError(error: unknown, signal: AbortSignal, url: string) {
    const host = new URL(url).host;
    if (signal.aborted) {
      return new MailerTimeoutError(
        `${this.label} (${host}) did not answer within ${this.timeout} ms`,
        { timeoutMs: this.timeout, cause: error },
      );
    }
    const source = error as { message?: string; cause?: { code?: string } };
    const code = source?.cause?.code;
    return new MailerConnectionError(
      `${this.label} request to ${host} failed: ${code ?? source?.message ?? 'network error'}`,
      {
        code,
        cause: error,
        // A certificate problem won't go away by itself
        permanent: /CERT|SELF_SIGNED/.test(code ?? ''),
      },
    );
  }
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The base URL without trailing slashes; https only, so keys never travel in the clear */
export function checkBaseUrl(url: string, owner: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`${owner} \`baseUrl\` is not a URL`);
  }
  if (
    parsed.protocol !== 'https:' &&
    !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)
  ) {
    throw new TypeError(
      `${owner} \`baseUrl\` must be https (the credentials travel with every request)`,
    );
  }
  return url.replace(/\/+$/, '');
}

/** A required, non-empty string option */
export function requiredString(
  value: unknown,
  owner: string,
  option: string,
): string {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`${owner} \`${option}\` is required`);
  }
  return value;
}

/** A string (or number) field of an unknown JSON body, the first one present */
export function field(body: unknown, ...names: string[]): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  for (const name of names) {
    const value = (body as Record<string, unknown>)[name];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return undefined;
}

/** `Name <address>`, quoting the name when it has specials. JSON APIs take UTF-8 names as they are. */
export function formatAddress({ name, address }: HttpAddress): string {
  if (!name) return address;
  const display = /[()<>[\]:;@\\,."]/.test(name)
    ? `"${name.replace(/(["\\])/g, '\\$1')}"`
    : name;
  return `${display} <${address}>`;
}

/** Drops `undefined` values, empty arrays and empty objects, so optional fields stay out of a payload */
export function compact<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) =>
        v !== undefined &&
        !(Array.isArray(v) && v.length === 0) &&
        !(
          v !== null &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          Object.keys(v).length === 0
        ),
    ),
  ) as Partial<T>;
}

/**
 * The message as JSON APIs take it, from nodemailer's own `normalize()`:
 * addresses parsed (groups flattened), bodies and attachments resolved
 * (files, URLs, streams), attachments base64. An `icalEvent` becomes a
 * `text/calendar` attachment.
 */
export function normalizeMail(
  mail: HttpMail,
  label: string,
): Promise<NormalizedMail> {
  if (mail.data.raw) {
    return Promise.reject(
      new MailerMessageError(
        `${label} takes structured fields, not a raw message: send raw MIME with SesTransport or MailgunTransport`,
        { field: 'raw' },
      ),
    );
  }
  // Checked before normalize(), which folds `raw` away
  const raw = ([] as any[])
    .concat(mail.data.attachments ?? [])
    .find((attachment) => attachment.raw !== undefined);
  if (raw) {
    return Promise.reject(
      new MailerMessageError(
        `${label} can't send a raw MIME attachment (${raw.filename ?? 'unnamed'}): use SesTransport or MailgunTransport`,
        { field: 'attachments' },
      ),
    );
  }
  return new Promise((resolve, reject) =>
    mail.normalize((err, data) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(fromNormalized(data, label));
      } catch (error) {
        reject(error);
      }
    }),
  );
}

function fromNormalized(data: Record<string, any>, label: string) {
  const from = addresses(data.from)[0];
  if (!from) {
    throw new MailerMessageError(`${label} needs a "from" address`, {
      field: 'from',
    });
  }
  const attachments: HttpAttachment[] = (data.attachments ?? []).map(
    toAttachment,
  );
  if (data.icalEvent) {
    const method = String(data.icalEvent.method ?? 'PUBLISH').toUpperCase();
    attachments.push(
      toAttachment({
        ...data.icalEvent,
        filename: data.icalEvent.filename || 'invite.ics',
        contentType: `text/calendar; charset=utf-8; method=${method}`,
      }),
    );
  }
  return {
    from,
    to: addresses(data.to),
    cc: addresses(data.cc),
    bcc: addresses(data.bcc),
    replyTo: addresses(data.replyTo),
    subject: data.subject ?? '',
    text: data.text || undefined,
    html: data.html || undefined,
    headers: headersOf(data),
    attachments,
    envelope: data.envelope,
    messageId: data.messageId,
    idempotencyKey: data.idempotencyKey || undefined,
  } satisfies NormalizedMail;
}

function addresses(value: unknown): HttpAddress[] {
  const list: HttpAddress[] = [];
  for (const entry of ([] as any[]).concat(value ?? [])) {
    if (Array.isArray(entry.group)) list.push(...addresses(entry.group));
    else if (entry.address) {
      list.push({ name: entry.name, address: entry.address });
    }
  }
  return list;
}

function toAttachment(attachment: Record<string, any>): HttpAttachment {
  const { content, encoding } = attachment;
  let base64 = '';
  if (typeof content === 'string') {
    base64 =
      encoding === 'base64'
        ? content.replace(/\s+/g, '')
        : // nodemailer turns content with another encoding into a buffer first
          Buffer.from(content, 'utf8').toString('base64');
  }
  return {
    filename: attachment.filename,
    content: base64,
    contentType: attachment.contentType,
    ...(attachment.cid && { cid: attachment.cid }),
    inline:
      Boolean(attachment.cid) || attachment.contentDisposition === 'inline',
  };
}

/** Header values as strings: the object form (through `normalizedHeaders`) and the array form */
function headersOf(data: Record<string, any>): Record<string, string> {
  const headers: Record<string, string> = {};
  const own = data.headers;
  const listed = new Set<string>();
  if (Array.isArray(own)) {
    own.forEach((header, index) => {
      listed.add(String(index));
      headers[header.key] = String(header.value);
    });
  }
  for (const [key, value] of Object.entries(data.normalizedHeaders)) {
    if (!listed.has(key)) headers[key] = String(value);
  }
  return headers;
}
