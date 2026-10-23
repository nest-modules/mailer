import {
  compact,
  HttpAddress,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  normalizeMail,
  ProviderErrorDetails,
  ProviderResponse,
  requiredString,
} from './http-provider.transport';

export interface SendGridTransportOptions extends HttpTransportOptions {
  /** A SendGrid API key, `SG....` */
  apiKey: string;
}

/**
 * Sends with SendGrid's `POST /v3/mail/send`, one personalization per
 * message. SendGrid has no idempotency keys, so a redelivered mail can be sent
 * twice. Set `baseUrl: 'https://api.eu.sendgrid.com'` for EU subusers.
 *
 * @example MailerModule.forRoot({ transport: new SendGridTransport({ apiKey: process.env.SENDGRID_API_KEY }) })
 */
export class SendGridTransport extends HttpProviderTransport {
  readonly #apiKey: string;

  constructor(options: SendGridTransportOptions) {
    super(
      {
        name: 'SendGridTransport',
        provider: 'sendgrid',
        label: 'SendGrid',
        defaultBaseUrl: 'https://api.sendgrid.com',
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
    const content = [
      // SendGrid wants text/plain first, then text/html
      m.text !== undefined && { type: 'text/plain', value: m.text },
      m.html !== undefined && { type: 'text/html', value: m.html },
    ].filter(Boolean);
    const body = compact({
      personalizations: [
        compact({
          to: m.to.map(sendGridAddress),
          cc: m.cc.map(sendGridAddress),
          bcc: m.bcc.map(sendGridAddress),
        }),
      ],
      from: sendGridAddress(m.from),
      reply_to:
        m.replyTo.length === 1 ? sendGridAddress(m.replyTo[0]) : undefined,
      reply_to_list:
        m.replyTo.length > 1 ? m.replyTo.map(sendGridAddress) : undefined,
      subject: m.subject,
      content,
      headers: m.headers,
      attachments: m.attachments.map((a) =>
        compact({
          content: a.content,
          filename: a.filename,
          type: a.contentType,
          disposition: a.inline ? 'inline' : 'attachment',
          content_id: a.cid,
        }),
      ),
    });
    const response = await this.request(`${this.baseUrl}/v3/mail/send`, {
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.sent(
      mail,
      response,
      response.headers.get('x-message-id') ?? undefined,
    );
  }

  protected errorDetails(response: ProviderResponse): ProviderErrorDetails {
    // `{ errors: [{ message, field }] }`
    const errors = (response.body as { errors?: unknown } | undefined)?.errors;
    if (!Array.isArray(errors)) return super.errorDetails(response);
    return {
      message: errors
        .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
        .join('; '),
    };
  }
}

function sendGridAddress({ name, address }: HttpAddress) {
  return compact({ email: address, name: name || undefined });
}
