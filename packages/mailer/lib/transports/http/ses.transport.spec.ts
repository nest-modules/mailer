import { createTransport } from 'nodemailer';
import { MailerProviderError } from '../../errors/mailer.errors';
import { SesTransport } from './ses.transport';
import { signV4 } from './sigv4';

const credentials = { accessKeyId: 'AKID', secretAccessKey: 'secret' };
const accepted = () => Response.json({ MessageId: 'ses-1' });

function setup(
  options: Record<string, any> = {},
  response: () => Response = accepted,
) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const transport = new SesTransport({
    region: 'eu-west-1',
    credentials,
    fetch,
    ...options,
  });
  return { fetch, mailer: createTransport(transport as any) };
}

const mail = {
  from: 'Ada <ada@x.test>',
  to: 'b@x.test',
  cc: 'c@x.test',
  bcc: 'secret@x.test',
  subject: 'Hello',
  html: '<img src="cid:logo">',
  headers: { 'X-Tag': 'a' },
  attachments: [{ filename: 'logo.png', content: 'png', cid: 'logo' }],
};

describe('SesTransport', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
    for (const name of [
      'AWS_REGION',
      'AWS_DEFAULT_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
    ]) {
      delete process.env[name];
    }
  });
  afterAll(() => {
    process.env = env;
  });

  it('should send the raw MIME to every envelope recipient, signed with SigV4', async () => {
    const { fetch, mailer } = setup({ configurationSetName: 'tracking' });
    const info = await mailer.sendMail(mail);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails',
    );
    const body = JSON.parse(init.body as string);
    expect(body.Destination).toEqual({
      ToAddresses: ['b@x.test', 'c@x.test', 'secret@x.test'],
    });
    expect(body.ConfigurationSetName).toBe('tracking');
    const raw = Buffer.from(body.Content.Raw.Data, 'base64').toString();
    expect(raw).toContain('Subject: Hello');
    expect(raw).toContain('X-Tag: a');
    expect(raw).toContain('Content-ID: <logo>');
    expect(raw).not.toContain('secret@x.test');

    const headers = init.headers as Record<string, string>;
    const date = headers['x-amz-date'];
    const expected = signV4(
      {
        method: 'POST',
        url: url as string,
        headers: { 'content-type': 'application/json' },
        body: init.body as string,
      },
      {
        credentials,
        region: 'eu-west-1',
        service: 'ses',
        date: new Date(
          date.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6Z',
          ),
        ),
      },
    );
    expect(headers).toEqual(expected.headers);
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/eu-west-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, /,
    );
    expect(headers).not.toHaveProperty('x-amz-security-token');
    expect(info).toMatchObject({
      messageId: 'ses-1',
      accepted: ['b@x.test', 'c@x.test', 'secret@x.test'],
      response: 'SES 200 ses-1',
    });
  });

  it('should keep messages nodemailer builds raw, like DKIM-signed ones or `raw`', async () => {
    const { fetch, mailer } = setup();
    await mailer.sendMail({
      envelope: { from: 'a@x.test', to: ['b@x.test'] },
      raw: 'From: a@x.test\r\nTo: b@x.test\r\nSubject: Raw\r\n\r\nBody',
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(Buffer.from(body.Content.Raw.Data, 'base64').toString()).toContain(
      'Subject: Raw',
    );
    expect(body).not.toHaveProperty('ConfigurationSetName');
  });

  it('should resolve credentials for every send, and sign the session token', async () => {
    const provider = jest.fn(async () => ({
      ...credentials,
      sessionToken: 'tok',
    }));
    const { fetch, mailer } = setup({
      credentials: provider,
      endpoint: 'https://vpce.example.test/',
    });
    await mailer.sendMail(mail);
    await mailer.sendMail(mail);
    expect(provider).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://vpce.example.test/v2/email/outbound-emails');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-amz-security-token']).toBe('tok');
    expect(headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-date;x-amz-security-token,',
    );
  });

  it('should refuse credentials a provider resolves badly', async () => {
    const { fetch, mailer } = setup({ credentials: () => ({}) });
    const error = await mailer.sendMail(mail).catch((e) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should fall back to the AWS environment variables', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-2';
    process.env.AWS_ACCESS_KEY_ID = 'ENVKEY';
    process.env.AWS_SECRET_ACCESS_KEY = 'envsecret';
    const fetch = jest.fn(async (_url: string, _init: RequestInit) =>
      accepted(),
    );
    const mailer = createTransport(new SesTransport({ fetch }) as any);
    await mailer.sendMail(mail);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://email.us-east-2.amazonaws.com/v2/email/outbound-emails',
    );
    expect((fetch.mock.calls[0] as any)[1].headers.authorization).toContain(
      'Credential=ENVKEY/',
    );

    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_SESSION_TOKEN = 'envtoken';
    await createTransport(new SesTransport({ fetch }) as any).sendMail(mail);
    expect(fetch.mock.calls[1][0]).toContain('email.ap-south-1.');
    expect(
      (fetch.mock.calls[1] as any)[1].headers['x-amz-security-token'],
    ).toBe('envtoken');
  });

  it('should refuse a missing region or credentials', () => {
    expect(() => new SesTransport()).toThrow(
      'SesTransport `region` is required',
    );
    expect(() => new SesTransport({ region: 'EU West' })).toThrow('`region`');
    expect(() => new SesTransport({ region: 'eu-west-1' })).toThrow(
      'SesTransport needs `credentials`',
    );
    process.env.AWS_ACCESS_KEY_ID = 'only-the-id';
    expect(() => new SesTransport({ region: 'eu-west-1' })).toThrow(
      'SesTransport needs `credentials`',
    );
    expect(
      () =>
        new SesTransport({
          region: 'eu-west-1',
          credentials: { accessKeyId: 'a' } as any,
        }),
    ).toThrow('SesTransport needs `credentials`');
  });

  it('should read the AWS error type and retry throttling', async () => {
    let next = () =>
      Response.json(
        { message: 'Email address is not verified.' },
        {
          status: 400,
          headers: {
            'x-amzn-errortype': 'MessageRejected:http://internal.amazon.com/',
          },
        },
      );
    const { mailer } = setup({}, () => next());
    const send = () => mailer.sendMail(mail).catch((e) => e);

    const rejected = await send();
    expect(rejected).toBeInstanceOf(MailerProviderError);
    expect(rejected).toMatchObject({
      provider: 'ses',
      status: 400,
      providerCode: 'MessageRejected',
      permanent: true,
      message:
        'SES refused the email (HTTP 400 MessageRejected): Email address is not verified.',
    });

    next = () =>
      Response.json(
        {
          __type: 'com.amazonaws.ses#LimitExceededException',
          Message: 'Daily quota',
        },
        { status: 400 },
      );
    const throttled = await send();
    expect(throttled.providerCode).toBe('LimitExceededException');
    expect(throttled.permanent).toBe(false);

    next = () => new Response('Bad Gateway', { status: 502 });
    const plain = await send();
    expect(plain.providerCode).toBeUndefined();
    expect(plain.message).toBe('SES refused the email (HTTP 502): Bad Gateway');
  });
});
