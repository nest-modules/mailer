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

export interface PostmarkTransportOptions extends HttpTransportOptions {
  /** A server API token (`X-Postmark-Server-Token`) */
  serverToken: string;
  /** Default `'outbound'`, Postmark's transactional stream */
  messageStream?: string;
}

/**
 * Sends with Postmark's `POST /email`. Postmark has no idempotency keys, so a
 * redelivered mail can be sent twice. It allows 50 recipients and 10 MB per message.
 *
 * @example MailerModule.forRoot({ transport: new PostmarkTransport({ serverToken: process.env.POSTMARK_TOKEN }) })
 */
export class PostmarkTransport extends HttpProviderTransport {
  readonly #serverToken: string;
  private readonly messageStream: string;

  constructor(options: PostmarkTransportOptions) {
    super(
      {
        name: 'PostmarkTransport',
        provider: 'postmark',
        label: 'Postmark',
        defaultBaseUrl: 'https://api.postmarkapp.com',
      },
      options,
    );
    this.#serverToken = requiredString(
      options.serverToken,
      this.name,
      'serverToken',
    );
    this.messageStream = options.messageStream ?? 'outbound';
  }

  protected async deliver(mail: HttpMail): Promise<HttpSentMessageInfo> {
    const m = await normalizeMail(mail, this.label);
    if (!m.to.length) {
      throw this.messageError('to', 'needs at least one "to" recipient');
    }
    const list = (addresses: typeof m.to) =>
      addresses.length ? addresses.map(formatAddress).join(', ') : undefined;
    const body = compact({
      From: formatAddress(m.from),
      To: list(m.to),
      Cc: list(m.cc),
      Bcc: list(m.bcc),
      ReplyTo: list(m.replyTo),
      Subject: m.subject,
      HtmlBody: m.html,
      TextBody: m.text,
      Headers: Object.entries(m.headers).map(([Name, Value]) => ({
        Name,
        Value,
      })),
      Attachments: m.attachments.map((a) =>
        compact({
          Name: a.filename,
          Content: a.content,
          ContentType: a.contentType,
          ContentID: a.cid && `cid:${a.cid}`,
        }),
      ),
      MessageStream: this.messageStream,
    });
    const response = await this.request(`${this.baseUrl}/email`, {
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-postmark-server-token': this.#serverToken,
      },
      body: JSON.stringify(body),
    });
    return this.sent(mail, response, field(response.body, 'MessageID'));
  }

  protected errorDetails({ body }: ProviderResponse): ProviderErrorDetails {
    return {
      code: field(body, 'ErrorCode'),
      message: field(body, 'Message'),
    };
  }
}
