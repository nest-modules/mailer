import { createTransport } from 'nodemailer';
import { MailerProviderError } from '../../errors/mailer.errors';
import { MailgunTransport } from './mailgun.transport';

const accepted = () =>
  Response.json({
    id: '<mg-1@mg.example.test>',
    message: 'Queued. Thank you.',
  });

function setup(
  options: Record<string, any> = {},
  response: () => Response = accepted,
) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const mailer = createTransport(
    new MailgunTransport({
      apiKey: 'mg-key',
      domain: 'mg.example.test',
      fetch,
      ...options,
    }) as any,
  );
  return { fetch, mailer };
}

describe('MailgunTransport', () => {
  it('should require an apiKey, a domain and a known region', () => {
    expect(() => new MailgunTransport({ domain: 'd' } as any)).toThrow(
      'MailgunTransport `apiKey` is required',
    );
    expect(() => new MailgunTransport({ apiKey: 'k' } as any)).toThrow(
      'MailgunTransport `domain` is required',
    );
    expect(
      () =>
        new MailgunTransport({
          apiKey: 'k',
          domain: 'd',
          region: 'toString' as any,
        }),
    ).toThrow('MailgunTransport `region` must be "us" or "eu"');
    expect(() => new MailgunTransport(undefined as any)).toThrow(
      'MailgunTransport needs options',
    );
  });

  it('should POST the raw MIME to every envelope recipient', async () => {
    const { fetch, mailer } = setup();
    const info = await mailer.sendMail({
      from: 'Ada <ada@x.test>',
      to: 'b@x.test',
      bcc: 'secret@x.test',
      subject: 'Hello',
      text: 'Hi',
      attachments: [{ filename: 'logo.png', content: 'png', cid: 'logo' }],
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://api.mailgun.net/v3/mg.example.test/messages.mime',
    );
    expect(init.headers).toEqual({
      accept: 'application/json',
      authorization: `Basic ${Buffer.from('api:mg-key').toString('base64')}`,
    });
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.getAll('to')).toEqual(['b@x.test', 'secret@x.test']);
    const message = form.get('message') as File;
    expect(message.name).toBe('message.mime');
    const raw = await message.text();
    expect(raw).toContain('Subject: Hello');
    expect(raw).toContain('Content-ID: <logo>');
    expect(raw).not.toContain('secret@x.test');
    expect(info).toMatchObject({
      messageId: '<mg-1@mg.example.test>',
      accepted: ['b@x.test', 'secret@x.test'],
      response: 'Mailgun 200 <mg-1@mg.example.test>',
    });
  });

  it('should target the EU region, or a base URL', async () => {
    const eu = setup({ region: 'eu' });
    await eu.mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' });
    expect(eu.fetch.mock.calls[0][0]).toBe(
      'https://api.eu.mailgun.net/v3/mg.example.test/messages.mime',
    );
    const custom = setup({ region: 'eu', baseUrl: 'https://mg.proxy.test' });
    await custom.mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' });
    expect(custom.fetch.mock.calls[0][0]).toBe(
      'https://mg.proxy.test/v3/mg.example.test/messages.mime',
    );
  });

  it("should read Mailgun's errors", async () => {
    let next = () =>
      Response.json(
        { message: "'to' parameter is not a valid address" },
        { status: 400 },
      );
    const { mailer } = setup({}, () => next());
    const send = () =>
      mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' }).catch((e) => e);
    const invalid = await send();
    expect(invalid).toBeInstanceOf(MailerProviderError);
    expect(invalid).toMatchObject({
      provider: 'mailgun',
      status: 400,
      permanent: true,
      message:
        "Mailgun refused the email (HTTP 400): 'to' parameter is not a valid address",
    });
    next = () => new Response('Forbidden', { status: 401 });
    const forbidden = await send();
    expect(forbidden.message).toBe(
      'Mailgun refused the email (HTTP 401): Forbidden',
    );
    expect(forbidden.message).not.toContain('mg-key');
  });
});
