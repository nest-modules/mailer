import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { createTransport } from 'nodemailer';
import {
  MailerMessageError,
  MailerProviderError,
} from '../../errors/mailer.errors';
import { MailerService } from '../../mailer.service';
import { ResendTransport } from './resend.transport';

function stub(...responses: Array<() => Response>) {
  let call = 0;
  return jest.fn(async (_url: string, _init: RequestInit) =>
    responses[Math.min(call++, responses.length - 1)](),
  );
}

const ok = () => Response.json({ id: 're-123' });
const payload = (fetch: jest.Mock, call = 0) =>
  JSON.parse(fetch.mock.calls[call][1].body);
const headers = (fetch: jest.Mock, call = 0) =>
  fetch.mock.calls[call][1].headers;

describe('ResendTransport', () => {
  it('should require an apiKey and default to the Resend API', async () => {
    expect(() => new ResendTransport({} as any)).toThrow(
      'ResendTransport `apiKey` is required',
    );
    const fetch = stub(ok);
    const transport = new ResendTransport({ apiKey: 're_secret', fetch });
    expect(transport.name).toBe('ResendTransport');
    await createTransport(transport as any).sendMail({
      from: 'a@x.test',
      to: 'b@x.test',
    });
    expect(fetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    // The key is not kept as an enumerable property
    expect(Object.values(transport)).not.toContain('re_secret');
    expect(inspect(transport)).not.toContain('re_secret');
  });

  it('should map the message to Resend fields', async () => {
    const fetch = stub(ok);
    const mailer = createTransport(
      new ResendTransport({
        apiKey: 're_key',
        fetch,
        baseUrl: 'https://proxy.test/',
      }) as any,
    );
    const info = await mailer.sendMail({
      from: 'Ada <ada@x.test>',
      to: ['b@x.test', 'Cy <c@x.test>'],
      cc: 'd@x.test',
      bcc: 'e@x.test',
      replyTo: 'r@x.test',
      subject: 'Hello',
      text: 'Hi',
      html: '<img src="cid:logo">',
      headers: { 'X-Tag': 'welcome' },
      attachments: [
        { filename: 'a.txt', content: 'A' },
        { filename: 'logo.png', content: Buffer.from('png'), cid: 'logo' },
      ],
    });

    expect(fetch.mock.calls[0][0]).toBe('https://proxy.test/emails');
    expect(headers(fetch)).toEqual({
      authorization: 'Bearer re_key',
      'content-type': 'application/json',
    });
    expect(payload(fetch)).toEqual({
      from: 'Ada <ada@x.test>',
      to: ['b@x.test', 'Cy <c@x.test>'],
      cc: ['d@x.test'],
      bcc: ['e@x.test'],
      reply_to: ['r@x.test'],
      subject: 'Hello',
      text: 'Hi',
      html: '<img src="cid:logo">',
      headers: { 'X-Tag': 'welcome' },
      attachments: [
        { filename: 'a.txt', content: 'QQ==', content_type: 'text/plain' },
        {
          filename: 'logo.png',
          content: Buffer.from('png').toString('base64'),
          content_type: 'image/png',
          content_id: 'logo',
        },
      ],
    });
    expect(info).toMatchObject({
      messageId: 're-123',
      accepted: ['b@x.test', 'c@x.test', 'd@x.test', 'e@x.test'],
      response: 'Resend 200 re-123',
    });
  });

  it('should send the idempotency key, hashing one longer than 256 characters', async () => {
    const fetch = stub(ok);
    const mailer = createTransport(
      new ResendTransport({ apiKey: 'k', fetch }) as any,
    );
    const mail = { from: 'a@x.test', to: 'b@x.test' };
    await mailer.sendMail({ ...mail, idempotencyKey: 'order-1' } as any);
    const long = 'k'.repeat(300);
    await mailer.sendMail({ ...mail, idempotencyKey: long } as any);
    expect(headers(fetch, 0)['idempotency-key']).toBe('order-1');
    expect(headers(fetch, 1)['idempotency-key']).toBe(
      createHash('sha256').update(long).digest('hex'),
    );
  });

  it('should refuse a message without a "to"', async () => {
    const fetch = stub(ok);
    const error = await createTransport(
      new ResendTransport({ apiKey: 'k', fetch }) as any,
    )
      .sendMail({ from: 'a@x.test', bcc: 'b@x.test' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(MailerMessageError);
    expect(error.field).toBe('to');
    expect(error.message).toMatch(/^Resend needs at least one "to"/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should classify Resend's errors, including idempotency conflicts", async () => {
    const refuse = (status: number, name: string) => () =>
      Response.json(
        { statusCode: status, name, message: `${name}!` },
        { status },
      );
    const fetch = stub(
      refuse(422, 'validation_error'),
      refuse(409, 'invalid_idempotent_request'),
      refuse(409, 'concurrent_idempotent_requests'),
    );
    const mailer = createTransport(
      new ResendTransport({ apiKey: 're_key', fetch }) as any,
    );
    const send = () =>
      mailer.sendMail({ from: 'a@x.test', to: 'b@x.test' }).catch((e) => e);

    const invalid = await send();
    expect(invalid).toBeInstanceOf(MailerProviderError);
    expect(invalid).toMatchObject({
      provider: 'resend',
      status: 422,
      providerCode: 'validation_error',
      permanent: true,
      message:
        'Resend refused the email (HTTP 422 validation_error): validation_error!',
    });
    expect(invalid.message).not.toContain('re_key');
    expect((await send()).permanent).toBe(true);
    expect((await send()).permanent).toBe(false);
  });

  describe('through MailerService', () => {
    const service = (fetch: jest.Mock) =>
      new MailerService(
        {
          transport: new ResendTransport({ apiKey: 'k', fetch }),
          retry: { attempts: 2, backoff: { delay: 0, maxDelay: 50 } },
        },
        // No factory: MailerService builds the nodemailer transporter itself
        undefined as any,
      );

    it('should retry a 429 after Retry-After and pass the idempotency key', async () => {
      const fetch = stub(
        () =>
          Response.json(
            { name: 'rate_limit_exceeded', message: 'Too many requests' },
            { status: 429, headers: { 'retry-after': '1' } },
          ),
        ok,
      );
      const started = Date.now();
      const info = await service(fetch).sendMail({
        from: 'a@x.test',
        to: 'b@x.test',
        subject: 'Order',
        text: 'Paid',
        idempotencyKey: 'order-42',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      // Retry-After (1s) is capped by maxDelay (50 ms)
      expect(Date.now() - started).toBeGreaterThanOrEqual(45);
      expect(info.messageId).toBe('re-123');
      for (const call of [0, 1]) {
        expect(headers(fetch, call)['idempotency-key']).toBe('order-42');
      }
    });

    it('should not retry a 422', async () => {
      const fetch = stub(() =>
        Response.json(
          { name: 'validation_error', message: 'Bad from' },
          { status: 422 },
        ),
      );
      const error = await service(fetch)
        .sendMail({ from: 'a@x.test', to: 'b@x.test', text: 'x' })
        .catch((e) => e);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(MailerProviderError);
      expect(error.status).toBe(422);
    });
  });
});
