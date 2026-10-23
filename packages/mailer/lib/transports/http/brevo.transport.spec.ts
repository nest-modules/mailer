import { createTransport } from 'nodemailer';
import {
  MailerMessageError,
  MailerProviderError,
} from '../../errors/mailer.errors';
import { BrevoTransport } from './brevo.transport';

const accepted = () =>
  Response.json({ messageId: '<br-1@smtp-relay.mailin.fr>' }, { status: 201 });

function setup(response: () => Response = accepted) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const mailer = createTransport(
    new BrevoTransport({ apiKey: 'xkeysib-key', fetch }) as any,
  );
  const body = (call = 0) =>
    JSON.parse(fetch.mock.calls[call][1].body as string);
  return { fetch, mailer, body };
}

describe('BrevoTransport', () => {
  it('should require an apiKey', () => {
    expect(() => new BrevoTransport({} as any)).toThrow(
      'BrevoTransport `apiKey` is required',
    );
  });

  it('should map the message to Brevo fields', async () => {
    const { fetch, mailer, body } = setup();
    const info = await mailer.sendMail({
      from: 'Ada <ada@x.test>',
      to: ['Bob <b@x.test>'],
      cc: 'c@x.test',
      bcc: 'd@x.test',
      replyTo: ['r@x.test', 's@x.test'],
      subject: 'Hello',
      text: 'Hi',
      html: '<b>Hi</b>',
      headers: { 'X-Tag': 'a' },
      idempotencyKey: 'order-1',
      attachments: [{ filename: 'a.txt', content: 'A' }],
    } as any);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toEqual({
      accept: 'application/json',
      'api-key': 'xkeysib-key',
      'content-type': 'application/json',
    });
    expect(body()).toEqual({
      sender: { email: 'ada@x.test', name: 'Ada' },
      to: [{ email: 'b@x.test', name: 'Bob' }],
      cc: [{ email: 'c@x.test' }],
      bcc: [{ email: 'd@x.test' }],
      replyTo: { email: 'r@x.test' },
      subject: 'Hello',
      textContent: 'Hi',
      htmlContent: '<b>Hi</b>',
      headers: { 'X-Tag': 'a', IdempotencyKey: 'order-1' },
      attachment: [{ name: 'a.txt', content: 'QQ==' }],
    });
    expect(info).toMatchObject({
      messageId: '<br-1@smtp-relay.mailin.fr>',
      response: 'Brevo 201 <br-1@smtp-relay.mailin.fr>',
    });
  });

  it('should leave out empty fields', async () => {
    const { mailer, body } = setup();
    await mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' });
    expect(body()).toEqual({
      sender: { email: 'a@x.test' },
      to: [{ email: 'b@x.test' }],
      subject: '',
    });
  });

  it('should refuse a message without a "to"', async () => {
    const { mailer } = setup();
    const error = await mailer
      .sendMail({ from: 'a@x.test', cc: 'b@x.test' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailerMessageError);
    expect(error.field).toBe('to');
  });

  it("should read Brevo's code and message", async () => {
    const { mailer } = setup(() =>
      Response.json(
        { code: 'invalid_parameter', message: 'email is not valid' },
        { status: 400 },
      ),
    );
    const error = await mailer
      .sendMail({ from: 'a@x.test', to: 'b@x.test' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailerProviderError);
    expect(error).toMatchObject({
      provider: 'brevo',
      providerCode: 'invalid_parameter',
      permanent: true,
    });
  });
});
