import {
  compact,
  field,
  HttpAddress,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  normalizeMail,
  requiredString,
} from './http-provider.transport';

export interface BrevoTransportOptions extends HttpTransportOptions {
  /** A Brevo API v3 key, `xkeysib-...` */
  apiKey: string;
}

/**
 * Sends with Brevo's (formerly Sendinblue) `POST /v3/smtp/email`. An
 * `idempotencyKey` is sent as `headers.IdempotencyKey`, the field Brevo's API
 * reference shows; Brevo doesn't document how it deduplicates. Brevo has no
 * content ids, so inline (`cid`) images go as regular attachments, and it
 * takes a single reply-to address.
 *
 * @example MailerModule.forRoot({ transport: new BrevoTransport({ apiKey: process.env.BREVO_API_KEY }) })
 */
export class BrevoTransport extends HttpProviderTransport {
  readonly #apiKey: string;

  constructor(options: BrevoTransportOptions) {
    super(
      {
        name: 'BrevoTransport',
        provider: 'brevo',
        label: 'Brevo',
        defaultBaseUrl: 'https://api.brevo.com',
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
      sender: brevoAddress(m.from),
      to: m.to.map(brevoAddress),
      cc: m.cc.map(brevoAddress),
      bcc: m.bcc.map(brevoAddress),
      replyTo: m.replyTo.length ? brevoAddress(m.replyTo[0]) : undefined,
      subject: m.subject,
      htmlContent: m.html,
      textContent: m.text,
      headers: compact({
        ...m.headers,
        IdempotencyKey: m.idempotencyKey,
      }),
      attachment: m.attachments.map((a) => ({
        name: a.filename,
        content: a.content,
      })),
    });
    const response = await this.request(`${this.baseUrl}/v3/smtp/email`, {
      headers: {
        accept: 'application/json',
        'api-key': this.#apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.sent(mail, response, field(response.body, 'messageId'));
  }
}

function brevoAddress({ name, address }: HttpAddress) {
  return compact({ email: address, name: name || undefined });
}
