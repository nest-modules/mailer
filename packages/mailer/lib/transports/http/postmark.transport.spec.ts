import { createTransport } from 'nodemailer';
import {
  MailerMessageError,
  MailerProviderError,
} from '../../errors/mailer.errors';
import { PostmarkTransport } from './postmark.transport';

const accepted = () =>
  Response.json({
    To: 'b@x.test',
    MessageID: 'pm-1',
    ErrorCode: 0,
    Message: 'OK',
  });

function setup(response = accepted, options = {}) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const mailer = createTransport(
    new PostmarkTransport({
      serverToken: 'pm-token',
      fetch,
      ...options,
    }) as any,
  );
  return { fetch, mailer };
}

describe('PostmarkTransport', () => {
  it('should require a serverToken', () => {
    expect(() => new PostmarkTransport({} as any)).toThrow(
      'PostmarkTransport `serverToken` is required',
    );
  });

  it('should map the message to Postmark fields', async () => {
    const { fetch, mailer } = setup();
    const info = await mailer.sendMail({
      from: 'Ada <ada@x.test>',
      to: ['b@x.test', 'c@x.test'],
      cc: 'd@x.test',
      bcc: 'e@x.test',
      replyTo: ['r@x.test', 's@x.test'],
      subject: 'Hello',
      text: 'Hi',
      html: '<b>Hi</b>',
      headers: { 'X-Tag': 'a' },
      attachments: [
        { filename: 'a.txt', content: 'A' },
        { filename: 'logo.png', content: 'png', cid: 'logo' },
      ],
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.postmarkapp.com/email');
    expect(init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'x-postmark-server-token': 'pm-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      From: 'Ada <ada@x.test>',
      To: 'b@x.test, c@x.test',
      Cc: 'd@x.test',
      Bcc: 'e@x.test',
      ReplyTo: 'r@x.test, s@x.test',
      Subject: 'Hello',
      TextBody: 'Hi',
      HtmlBody: '<b>Hi</b>',
      Headers: [{ Name: 'X-Tag', Value: 'a' }],
      Attachments: [
        { Name: 'a.txt', Content: 'QQ==', ContentType: 'text/plain' },
        {
          Name: 'logo.png',
          Content: Buffer.from('png').toString('base64'),
          ContentType: 'image/png',
          ContentID: 'cid:logo',
        },
      ],
      MessageStream: 'outbound',
    });
    expect(info).toMatchObject({
      messageId: 'pm-1',
      response: 'Postmark 200 pm-1',
    });
  });

  it('should leave out empty fields and use the given stream', async () => {
    const { fetch, mailer } = setup(accepted, { messageStream: 'broadcast' });
    await mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' });
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      From: 'a@x.test',
      To: 'b@x.test',
      Subject: '',
      MessageStream: 'broadcast',
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

  it("should read Postmark's ErrorCode and Message", async () => {
    const { mailer } = setup(() =>
      Response.json(
        { ErrorCode: 406, Message: 'Inactive recipient' },
        { status: 422 },
      ),
    );
    const error = await mailer
      .sendMail({ from: 'a@x.test', to: 'b@x.test' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailerProviderError);
    expect(error).toMatchObject({
      provider: 'postmark',
      providerCode: '406',
      permanent: true,
      message: 'Postmark refused the email (HTTP 422 406): Inactive recipient',
    });
  });
});
