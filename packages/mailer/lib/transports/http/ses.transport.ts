import { buildRaw } from '../captured-mail';
import {
  field,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  HttpTransportOptions,
  ProviderErrorDetails,
  ProviderResponse,
} from './http-provider.transport';
import { AwsCredentials, signV4 } from './sigv4';

export interface SesTransportOptions
  extends Omit<HttpTransportOptions, 'baseUrl'> {
  /** Default: `AWS_REGION`, then `AWS_DEFAULT_REGION` */
  region?: string;
  /**
   * Static credentials, or a function resolving them, called for every send so
   * it can refresh (the AWS SDK's `fromNodeProviderChain()` fits).
   * Default: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`.
   */
  credentials?:
    | AwsCredentials
    | (() => AwsCredentials | Promise<AwsCredentials>);
  /** Sent as `ConfigurationSetName`, for event publishing and dedicated IPs */
  configurationSetName?: string;
  /** Default `https://email.<region>.amazonaws.com` */
  endpoint?: string;
}

/** Error codes that mean "slow down", not "this message is wrong" */
const THROTTLING = new Set([
  'TooManyRequestsException',
  'LimitExceededException',
  'ThrottlingException',
  'Throttling',
  'RequestThrottled',
]);

/**
 * Sends with Amazon SES v2 (`POST /v2/email/outbound-emails`) as raw MIME,
 * signed with Signature Version 4 on `node:crypto`, without the AWS SDK. The
 * message goes out exactly as nodemailer builds it: attachments, inline
 * images, custom headers and DKIM signatures from plugins. Every envelope
 * recipient is a destination, so bcc works. SES has no idempotency keys.
 *
 * @example MailerModule.forRoot({ transport: new SesTransport({ region: 'eu-west-1' }) })
 */
export class SesTransport extends HttpProviderTransport {
  readonly #credentials: NonNullable<SesTransportOptions['credentials']>;
  private readonly region: string;
  private readonly configurationSetName?: string;

  constructor(options: SesTransportOptions = {}) {
    const region =
      options.region ??
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION;
    if (!region || !/^[a-z0-9-]+$/.test(region)) {
      throw new TypeError(
        'SesTransport `region` is required (or AWS_REGION), e.g. "eu-west-1"',
      );
    }
    super(
      {
        name: 'SesTransport',
        provider: 'ses',
        label: 'SES',
        defaultBaseUrl: `https://email.${region}.amazonaws.com`,
      },
      { ...options, baseUrl: options.endpoint },
    );
    this.region = region;
    this.configurationSetName = options.configurationSetName;
    const credentials = options.credentials ?? fromEnvironment();
    if (typeof credentials !== 'function') checkCredentials(credentials);
    this.#credentials = credentials as NonNullable<
      SesTransportOptions['credentials']
    >;
  }

  protected async deliver(mail: HttpMail): Promise<HttpSentMessageInfo> {
    const raw = await buildRaw(mail);
    const envelope = mail.message.getEnvelope();
    const body = JSON.stringify({
      // Explicit, so bcc recipients (never in the MIME headers) receive it too
      Destination: { ToAddresses: envelope.to },
      Content: { Raw: { Data: raw.toString('base64') } },
      ...(this.configurationSetName && {
        ConfigurationSetName: this.configurationSetName,
      }),
    });
    const credentials =
      typeof this.#credentials === 'function'
        ? await this.#credentials()
        : this.#credentials;
    checkCredentials(credentials);
    const url = `${this.baseUrl}/v2/email/outbound-emails`;
    const { headers } = signV4(
      {
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        body,
      },
      { credentials, region: this.region, service: 'ses' },
    );
    const response = await this.request(url, { headers, body });
    return this.sent(mail, response, field(response.body, 'MessageId'));
  }

  protected errorDetails({
    body,
    headers,
  }: ProviderResponse): ProviderErrorDetails {
    // `x-amzn-ErrorType` looks like `Name:http://...`; a body `__type` like `com.amazon...#Name`
    const raw =
      headers.get('x-amzn-errortype') ??
      field(body, '__type', 'code', 'Code') ??
      '';
    const code = raw.split(':', 1)[0].split('#').pop() || undefined;
    return {
      code,
      message: field(body, 'message', 'Message'),
      ...(code !== undefined && THROTTLING.has(code) && { permanent: false }),
    };
  }
}

function fromEnvironment(): AwsCredentials | undefined {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } =
    process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return undefined;
  return {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    ...(AWS_SESSION_TOKEN && { sessionToken: AWS_SESSION_TOKEN }),
  };
}

function checkCredentials(
  credentials: AwsCredentials | undefined,
): asserts credentials is AwsCredentials {
  if (
    !credentials ||
    typeof credentials.accessKeyId !== 'string' ||
    typeof credentials.secretAccessKey !== 'string'
  ) {
    throw new TypeError(
      'SesTransport needs `credentials` ({ accessKeyId, secretAccessKey }, or a function returning them) ' +
        'or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment',
    );
  }
}
