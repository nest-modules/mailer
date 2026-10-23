import { createHash } from 'node:crypto';
import {
  compact,
  field,
  formatAddress,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  normalizeMail,
  ProviderErrorDetails,
  ProviderResponse,
  requiredString,
} from './http-provider.transport';

export interface ResendTransportOptions extends HttpTransportOptions {
  /** A Resend API key, `re_...` */
  apiKey: string;
}

/**
 * Sends with Resend's `POST /emails`. An `idempotencyKey` given to
 * `MailerService` goes out as the `Idempotency-Key` header (Resend keeps it
 * 24 hours), so a retried or redelivered mail isn't sent twice. Inline images
 * (`cid`) go as attachments with `content_id`.
 *
 * @example MailerModule.forRoot({ transport: new ResendTransport({ apiKey: process.env.RESEND_API_KEY }) })
 */
export class ResendTransport extends HttpProviderTransport {
  readonly #apiKey: string;

  constructor(options: ResendTransportOptions) {
    super(
      {
        name: 'ResendTransport',
        provider: 'resend',
        label: 'Resend',
        defaultBaseUrl: 'https://api.resend.com',
      },
      options,
    );
    this.#apiKey = requiredString(options.apiKey, this.name, 'apiKey');
  }

  protected async deliver(mail: HttpMail): Promise<HttpSentMessageInfo> {
    const m = await normalizeMail(mail, this.label);
    if (!m.to.length) {
      throw this.messageError(
        'to',
        'needs at least one "to" recipient (cc or bcc alone is not enough)',
      );
    }
    const body = compact({
      from: formatAddress(m.from),
      to: m.to.map(formatAddress),
      cc: m.cc.map(formatAddress),
      bcc: m.bcc.map(formatAddress),
      reply_to: m.replyTo.map(formatAddress),
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: m.headers,
      attachments: m.attachments.map((a) =>
        compact({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
          content_id: a.cid,
        }),
      ),
    });
    const response = await this.request(`${this.baseUrl}/emails`, {
      headers: compact({
        authorization: `Bearer ${this.#apiKey}`,
        'content-type': 'application/json',
        'idempotency-key':
          m.idempotencyKey === undefined
            ? undefined
            : idempotencyKey(m.idempotencyKey),
      }) as Record<string, string>,
      body: JSON.stringify(body),
    });
    return this.sent(mail, response, field(response.body, 'id'));
  }

  protected errorDetails({ body }: ProviderResponse): ProviderErrorDetails {
    const name = field(body, 'name');
    return {
      code: name,
      message: field(body, 'message'),
      // A request with the same key is still running: try again later. The
      // same key with a different body is a mistake that won't go away.
      ...(name === 'concurrent_idempotent_requests' && { permanent: false }),
      ...(name === 'invalid_idempotent_request' && { permanent: true }),
    };
  }
}

/** Resend takes keys of 1-256 characters; a longer one is hashed to fit */
function idempotencyKey(key: string): string {
  return key.length <= 256
    ? key
    : createHash('sha256').update(key).digest('hex');
}
