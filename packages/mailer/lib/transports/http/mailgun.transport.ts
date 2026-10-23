import { buildRaw } from '../captured-mail';
import {
  field,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  requiredString,
} from './http-provider.transport';

export interface MailgunTransportOptions extends HttpTransportOptions {
  /** A Mailgun API key (sent as basic auth `api:<key>`) */
  apiKey: string;
  /** The sending domain, e.g. `mg.example.com` */
  domain: string;
  /** `'eu'` for domains in Mailgun's EU region. Default `'us'`. Ignored when `baseUrl` is set. */
  region?: 'us' | 'eu';
}

const REGIONS = {
  us: 'https://api.mailgun.net',
  eu: 'https://api.eu.mailgun.net',
};

/**
 * Sends with Mailgun's MIME endpoint (`POST /v3/{domain}/messages.mime`): the
 * message goes out exactly as nodemailer builds it (attachments, inline
 * images, custom headers, DKIM from plugins), to every envelope recipient, so
 * bcc works. Mailgun has no idempotency keys.
 *
 * @example MailerModule.forRoot({ transport: new MailgunTransport({ apiKey, domain: 'mg.example.com', region: 'eu' }) })
 */
export class MailgunTransport extends HttpProviderTransport {
  readonly #apiKey: string;
  private readonly domain: string;

  constructor(options: MailgunTransportOptions) {
    const region = options?.region ?? 'us';
    if (!Object.hasOwn(REGIONS, region)) {
      throw new TypeError('MailgunTransport `region` must be "us" or "eu"');
    }
    super(
      {
        name: 'MailgunTransport',
        provider: 'mailgun',
        label: 'Mailgun',
        defaultBaseUrl: REGIONS[region],
      },
      options,
    );
    this.#apiKey = requiredString(options.apiKey, this.name, 'apiKey');
    this.domain = requiredString(options.domain, this.name, 'domain');
  }

  protected async deliver(mail: HttpMail): Promise<HttpSentMessageInfo> {
    const raw = await buildRaw(mail);
    const form = new FormData();
    for (const recipient of mail.message.getEnvelope().to) {
      form.append('to', recipient);
    }
    form.append('message', new Blob([new Uint8Array(raw)]), 'message.mime');
    const response = await this.request(
      `${this.baseUrl}/v3/${encodeURIComponent(this.domain)}/messages.mime`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`api:${this.#apiKey}`).toString('base64')}`,
        },
        body: form,
      },
    );
    return this.sent(mail, response, field(response.body, 'id'));
  }
}
