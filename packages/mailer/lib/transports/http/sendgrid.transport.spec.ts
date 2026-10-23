import { createTransport } from 'nodemailer';
import {
  MailerMessageError,
  MailerProviderError,
} from '../../errors/mailer.errors';
import { SendGridTransport } from './sendgrid.transport';

const accepted = () =>
  new Response(null, { status: 202, headers: { 'x-message-id': 'sg-1' } });

function setup(response: () => Response = accepted) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const mailer = createTransport(
    new SendGridTransport({ apiKey: 'SG.key', fetch }) as any,
  );
  const body = (call = 0) =>
    JSON.parse(fetch.mock.calls[call][1].body as string);
  return { fetch, mailer, body };
}

describe('SendGridTransport', () => {
  it('should require an apiKey', () => {
    expect(() => new SendGridTransport({} as any)).toThrow(
      'SendGridTransport `apiKey` is required',
    );
  });

  it('should map the message to one personalization', async () => {
    const { fetch, mailer, body } = setup();
    const info = await mailer.sendMail({
      from: 'Ada <ada@x.test>',
      to: ['Bob <b@x.test>', 'c@x.test'],
      cc: 'd@x.test',
      bcc: 'e@x.test',
      replyTo: 'r@x.test',
      subject: 'Hello',
      html: '<img src="cid:logo">',
      text: 'Hi',
      headers: { 'X-Tag': 'a' },
      attachments: [
        { filename: 'a.txt', content: 'A' },
        { filename: 'logo.png', content: 'png', cid: 'logo' },
      ],
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.headers).toEqual({
      authorization: 'Bearer SG.key',
      'content-type': 'application/json',
    });
    expect(body()).toEqual({
      personalizations: [
        {
          to: [{ email: 'b@x.test', name: 'Bob' }, { email: 'c@x.test' }],
          cc: [{ email: 'd@x.test' }],
          bcc: [{ email: 'e@x.test' }],
        },
      ],
      from: { email: 'ada@x.test', name: 'Ada' },
      reply_to: { email: 'r@x.test' },
      subject: 'Hello',
      content: [
        { type: 'text/plain', value: 'Hi' },
        { type: 'text/html', value: '<img src="cid:logo">' },
      ],
      headers: { 'X-Tag': 'a' },
      attachments: [
        {
          content: 'QQ==',
          filename: 'a.txt',
          type: 'text/plain',
          disposition: 'attachment',
        },
        {
          content: Buffer.from('png').toString('base64'),
          filename: 'logo.png',
          type: 'image/png',
          disposition: 'inline',
          content_id: 'logo',
        },
      ],
    });
    expect(info).toMatchObject({
      messageId: 'sg-1',
      providerMessageId: 'sg-1',
      response: 'SendGrid 202 sg-1',
    });
  });

  it('should use reply_to_list for several reply-to addresses, and only send the parts there are', async () => {
    const { mailer, body } = setup(() => new Response(null, { status: 202 }));
    const info = await mailer.sendMail({
      from: 'a@x.test',
      to: 'b@x.test',
      replyTo: ['r@x.test', 'S <s@x.test>'],
      html: '<p>only html</p>',
      messageId: '<own@x.test>',
    });
    expect(body()).toMatchObject({
      reply_to_list: [{ email: 'r@x.test' }, { email: 's@x.test', name: 'S' }],
      content: [{ type: 'text/html', value: '<p>only html</p>' }],
    });
    expect(body()).not.toHaveProperty('reply_to');
    // No X-Message-Id: the message's own Message-ID
    expect(info.messageId).toBe('<own@x.test>');

    await mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' });
    expect(body(1)).not.toHaveProperty('content');
    expect(body(1)).not.toHaveProperty('reply_to_list');
  });

  it('should refuse a message without a "to"', async () => {
    const { mailer } = setup();
    const error = await mailer
      .sendMail({ from: 'a@x.test', bcc: 'b@x.test' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailerMessageError);
    expect(error.field).toBe('to');
  });

  it("should join SendGrid's error list", async () => {
    let next = () =>
      Response.json(
        {
          errors: [
            { message: 'Invalid email', field: 'from.email' },
            { message: 'Something else', field: null },
          ],
        },
        { status: 400 },
      );
    const { mailer } = setup(() => next());
    const send = () =>
      mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' }).catch((e) => e);
    const error = await send();
    expect(error).toBeInstanceOf(MailerProviderError);
    expect(error.message).toBe(
      'SendGrid refused the email (HTTP 400): from.email: Invalid email; Something else',
    );

    next = () => new Response('Unauthorized', { status: 401 });
    expect((await send()).message).toBe(
      'SendGrid refused the email (HTTP 401): Unauthorized',
    );
    next = () => new Response(null, { status: 500 });
    expect((await send()).permanent).toBe(false);
  });
});
