import { createTransport } from 'nodemailer';
import {
  MailerConnectionError,
  MailerMessageError,
  MailerProviderError,
  MailerTimeoutError,
} from '../../errors/mailer.errors';
import {
  checkBaseUrl,
  compact,
  field,
  formatAddress,
  HttpMail,
  HttpProviderTransport,
  HttpSentMessageInfo,
  NormalizedMail,
  normalizeMail,
  requiredString,
} from './http-provider.transport';
import * as barrel from './index';

/** A transport that records what normalizeMail gives it */
class EchoTransport extends HttpProviderTransport {
  normalized?: NormalizedMail;

  constructor(options: any) {
    super(
      {
        name: 'EchoTransport',
        provider: 'echo',
        label: 'Echo',
        defaultBaseUrl: 'https://api.echo.test/',
      },
      options,
    );
  }

  protected async deliver(mail: HttpMail): Promise<HttpSentMessageInfo> {
    this.normalized = await normalizeMail(mail, this.label);
    const response = await this.request(`${this.baseUrl}/send`, {
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return this.sent(mail, response, (response.body as any)?.id);
  }

  get url() {
    return this.baseUrl;
  }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), init);

function setup(response: () => Response | Promise<Response>, options = {}) {
  const fetch = jest.fn(async (_url: string, _init: RequestInit) => response());
  const transport = new EchoTransport({ fetch, ...options });
  const mailer = createTransport(transport as any);
  return { fetch, transport, mailer };
}

const base = { from: 'Ada <ada@example.test>', to: 'bob@example.test' };

describe('HttpProviderTransport', () => {
  describe('options', () => {
    it('should identify itself and strip trailing slashes from the base URL', () => {
      const transport = new EchoTransport({});
      expect(transport.name).toBe('EchoTransport');
      expect(transport.version).toBe('1.0.0');
      expect(transport.url).toBe('https://api.echo.test');
      expect(
        new EchoTransport({ baseUrl: 'http://localhost:3000//' }).url,
      ).toBe('http://localhost:3000');
    });

    it('should refuse missing options, a bad timeout, fetch or base URL', () => {
      expect(() => new EchoTransport(undefined)).toThrow(
        'EchoTransport needs options',
      );
      expect(() => new EchoTransport({ timeout: 0 })).toThrow('`timeout`');
      expect(() => new EchoTransport({ timeout: Number.NaN })).toThrow(
        '`timeout`',
      );
      expect(() => new EchoTransport({ fetch: 'no' })).toThrow('`fetch`');
      expect(() => new EchoTransport({ baseUrl: 'nope' })).toThrow(
        'is not a URL',
      );
      expect(
        () => new EchoTransport({ baseUrl: 'http://api.echo.test' }),
      ).toThrow('must be https');
    });
  });

  describe('request', () => {
    it('should POST with a timeout signal and report the provider id', async () => {
      const { fetch, mailer } = setup(() => json({ id: 'p-1' }));
      const info = await mailer.sendMail({ ...base, bcc: 'c@example.test' });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.echo.test/send');
      expect(init).toMatchObject({
        method: 'POST',
        redirect: 'error',
        body: '{}',
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(info).toMatchObject({
        messageId: 'p-1',
        providerMessageId: 'p-1',
        envelope: {
          from: 'ada@example.test',
          to: ['bob@example.test', 'c@example.test'],
        },
        accepted: ['bob@example.test', 'c@example.test'],
        rejected: [],
        response: 'Echo 200 p-1',
      });
    });

    it("should fall back to the message's Message-ID", async () => {
      const { mailer } = setup(() => new Response(null, { status: 202 }));
      const info = await mailer.sendMail({ ...base, messageId: '<m@x.test>' });
      expect(info.messageId).toBe('<m@x.test>');
      expect(info).not.toHaveProperty('providerMessageId');
      expect(info.response).toBe('Echo 202');
    });

    it('should use the global fetch by default', async () => {
      const spy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(json({ id: 'g' }));
      try {
        const info = await createTransport(
          new EchoTransport({}) as any,
        ).sendMail(base);
        expect(info.messageId).toBe('g');
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('should turn a refusal into a MailerProviderError with Retry-After', async () => {
      const { mailer } = setup(() =>
        json(
          { code: 'rate_limited', message: 'Slow down' },
          { status: 429, headers: { 'retry-after': '2' } },
        ),
      );
      const error = await mailer.sendMail(base).catch((e) => e);
      expect(error).toBeInstanceOf(MailerProviderError);
      expect(error).toMatchObject({
        message: 'Echo refused the email (HTTP 429 rate_limited): Slow down',
        provider: 'echo',
        status: 429,
        providerCode: 'rate_limited',
        retryAfterMs: 2000,
        permanent: false,
      });
    });

    it('should use a text body as the detail, capped, and work without one', async () => {
      let next: Response = new Response('x'.repeat(2000), { status: 422 });
      const { mailer } = setup(() => next);
      const error = await mailer.sendMail(base).catch((e) => e);
      expect(error.message).toBe(
        `Echo refused the email (HTTP 422): ${'x'.repeat(500)}`,
      );
      expect(error.permanent).toBe(true);
      expect(error).not.toHaveProperty('retryAfterMs');

      next = new Response(null, { status: 503 });
      const empty = await mailer.sendMail(base).catch((e) => e);
      expect(empty.message).toBe('Echo refused the email (HTTP 503)');
      expect(empty.permanent).toBe(false);

      next = json({ ErrorCode: 300, Message: 'Invalid' }, { status: 422 });
      const numeric = await mailer.sendMail(base).catch((e) => e);
      expect(numeric.providerCode).toBe('300');
    });

    it('should report a request that takes too long as a MailerTimeoutError', async () => {
      const fetch = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(init.signal!.reason),
            ),
          ),
      );
      const mailer = createTransport(
        new EchoTransport({ fetch, timeout: 5 }) as any,
      );
      const error = await mailer.sendMail(base).catch((e) => e);
      expect(error).toBeInstanceOf(MailerTimeoutError);
      expect(error).toMatchObject({
        message: 'Echo (api.echo.test) did not answer within 5 ms',
        timeoutMs: 5,
        permanent: false,
      });
    });

    it('should report network failures as a MailerConnectionError', async () => {
      let failure: unknown = Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      });
      const { mailer } = setup(() => {
        throw failure;
      });
      const refused = await mailer.sendMail(base).catch((e) => e);
      expect(refused).toBeInstanceOf(MailerConnectionError);
      expect(refused).toMatchObject({
        message: 'Echo request to api.echo.test failed: ECONNREFUSED',
        code: 'ECONNREFUSED',
        permanent: false,
        cause: failure,
      });

      failure = Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'CERT_HAS_EXPIRED' },
      });
      expect((await mailer.sendMail(base).catch((e) => e)).permanent).toBe(
        true,
      );

      failure = new TypeError('redirect');
      expect((await mailer.sendMail(base).catch((e) => e)).message).toBe(
        'Echo request to api.echo.test failed: redirect',
      );

      failure = {};
      expect((await mailer.sendMail(base).catch((e) => e)).message).toBe(
        'Echo request to api.echo.test failed: network error',
      );

      failure = undefined;
      expect(await mailer.sendMail(base).catch((e) => e)).toBeInstanceOf(
        MailerConnectionError,
      );
    });
  });

  describe('normalizeMail', () => {
    async function normalize(mail: Record<string, any>) {
      const { transport, mailer } = setup(() => json({ id: '1' }));
      await mailer.sendMail(mail);
      return transport.normalized!;
    }

    it('should parse addresses, flatten groups and resolve every content', async () => {
      const m = await normalize({
        from: '"Doe, Ada" <ada@example.test>',
        to: [
          'bob@example.test',
          'Team: c@example.test, "D" <d@example.test>;',
          'not-an-address',
        ],
        cc: 'Cy <cy@example.test>',
        bcc: [{ name: 'B', address: 'b@example.test' }],
        replyTo: 'r@example.test',
        subject: 'Hi',
        text: Buffer.from('text'),
        html: '<p>html</p>',
        idempotencyKey: 'key-1',
        attachments: [
          { filename: 'a.txt', content: 'plain' },
          { filename: 'b.bin', content: Buffer.from([1, 2, 3]) },
          { filename: 'c.txt', content: 'aGk=\n', encoding: 'base64' },
          { filename: 'd.txt', content: '6869', encoding: 'hex' },
          { filename: 'e.png', content: 'img', cid: 'logo' },
          {
            filename: 'f.txt',
            content: 'inline',
            contentDisposition: 'inline',
          },
          { filename: 'g.txt' },
        ],
      });
      expect(m.from).toEqual({ name: 'Doe, Ada', address: 'ada@example.test' });
      expect(m.to.map((a) => a.address)).toEqual([
        'bob@example.test',
        'c@example.test',
        'd@example.test',
      ]);
      expect(m.cc).toEqual([{ name: 'Cy', address: 'cy@example.test' }]);
      expect(m.bcc).toEqual([{ name: 'B', address: 'b@example.test' }]);
      expect(m.replyTo).toEqual([{ name: '', address: 'r@example.test' }]);
      expect(m).toMatchObject({
        subject: 'Hi',
        text: 'text',
        html: '<p>html</p>',
        idempotencyKey: 'key-1',
      });
      expect(m.messageId).toMatch(/^<.+>$/);
      expect(m.attachments).toEqual([
        {
          filename: 'a.txt',
          content: Buffer.from('plain').toString('base64'),
          contentType: 'text/plain',
          inline: false,
        },
        {
          filename: 'b.bin',
          content: 'AQID',
          contentType: 'application/octet-stream',
          inline: false,
        },
        {
          filename: 'c.txt',
          content: 'aGk=',
          contentType: 'text/plain',
          inline: false,
        },
        {
          filename: 'd.txt',
          content: 'aGk=',
          contentType: 'text/plain',
          inline: false,
        },
        {
          filename: 'e.png',
          content: Buffer.from('img').toString('base64'),
          contentType: 'image/png',
          cid: 'logo',
          inline: true,
        },
        {
          filename: 'f.txt',
          content: Buffer.from('inline').toString('base64'),
          contentType: 'text/plain',
          inline: true,
        },
        {
          filename: 'g.txt',
          content: '',
          contentType: 'text/plain',
          inline: false,
        },
      ]);
    });

    it('should default what is missing', async () => {
      const m = await normalize(base);
      expect(m).toMatchObject({
        subject: '',
        cc: [],
        bcc: [],
        replyTo: [],
        attachments: [],
        headers: {},
      });
      expect(m.text).toBeUndefined();
      expect(m.html).toBeUndefined();
      expect(m.idempotencyKey).toBeUndefined();
    });

    it('should keep custom, list and threading headers, in both forms', async () => {
      const m = await normalize({
        ...base,
        headers: { 'X-Tag': 'a', 'X-Prepared': { prepared: true, value: 'p' } },
        list: { unsubscribe: 'https://example.test/u' },
        inReplyTo: '<a@x.test>',
        references: ['<a@x.test>'],
      });
      expect(m.headers).toMatchObject({
        'X-Tag': 'a',
        'X-Prepared': 'p',
        'list-unsubscribe': '<https://example.test/u>',
        'in-reply-to': '<a@x.test>',
        references: '<a@x.test>',
      });

      const listed = await normalize({
        ...base,
        headers: [
          { key: 'X-One', value: '1' },
          { key: 'X-Two', value: '2' },
        ],
      });
      expect(listed.headers).toEqual({ 'X-One': '1', 'X-Two': '2' });
    });

    it('should turn an icalEvent into a text/calendar attachment', async () => {
      const m = await normalize({
        ...base,
        icalEvent: { content: 'BEGIN:VCALENDAR' },
      });
      expect(m.attachments).toEqual([
        {
          filename: 'invite.ics',
          content: Buffer.from('BEGIN:VCALENDAR').toString('base64'),
          contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
          inline: false,
        },
      ]);
      const named = await normalize({
        ...base,
        icalEvent: {
          filename: 'm.ics',
          method: 'request',
          content: Buffer.from('X'),
        },
      });
      expect(named.attachments[0]).toMatchObject({
        filename: 'm.ics',
        content: 'WA==',
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      });
    });

    it('should refuse raw messages, raw attachments and a missing from', async () => {
      const { mailer, fetch } = setup(() => json({}));
      const raw = await mailer
        .sendMail({
          envelope: { from: 'a@x.test', to: ['b@x.test'] },
          raw: 'Subject: x\r\n\r\nx',
        })
        .catch((e) => e);
      expect(raw).toBeInstanceOf(MailerMessageError);
      expect(raw.field).toBe('raw');

      const rawAttachment = await mailer
        .sendMail({ ...base, attachments: [{ filename: 'r.eml', raw: 'x' }] })
        .catch((e) => e);
      expect(rawAttachment).toBeInstanceOf(MailerMessageError);
      expect(rawAttachment.field).toBe('attachments');
      expect(rawAttachment.message).toContain('(r.eml)');
      const unnamed = await mailer
        .sendMail({ ...base, attachments: [{ raw: 'x' }] })
        .catch((e) => e);
      expect(unnamed.message).toContain('(unnamed)');

      const noFrom = await mailer.sendMail({ to: 'b@x.test' }).catch((e) => e);
      expect(noFrom).toBeInstanceOf(MailerMessageError);
      expect(noFrom.message).toBe('Echo needs a "from" address');
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should pass nodemailer's resolution errors through", async () => {
      const { mailer } = setup(() => json({}));
      const error = await mailer
        .sendMail({ ...base, attachments: [{ path: '/no/such/file.txt' }] })
        .catch((e) => e);
      expect(error.code).toBe('ENOENT');
    });
  });

  describe('helpers', () => {
    it('formatAddress should quote names with specials', () => {
      expect(formatAddress({ name: '', address: 'a@x.test' })).toBe('a@x.test');
      expect(formatAddress({ name: 'Ada', address: 'a@x.test' })).toBe(
        'Ada <a@x.test>',
      );
      expect(formatAddress({ name: 'Doe, "A"', address: 'a@x.test' })).toBe(
        '"Doe, \\"A\\"" <a@x.test>',
      );
    });

    it('compact should drop undefined, empty arrays and empty objects', () => {
      expect(
        compact({
          a: undefined,
          b: [],
          c: {},
          d: null,
          e: 0,
          f: '',
          g: [1],
          h: { x: 1 },
        }),
      ).toEqual({ d: null, e: 0, f: '', g: [1], h: { x: 1 } });
    });

    it('field should read the first string or number field', () => {
      expect(field({ a: 1, b: 'x' }, 'a', 'b')).toBe('1');
      expect(field({ a: {}, b: 'x' }, 'a', 'b')).toBe('x');
      expect(field({}, 'a')).toBeUndefined();
      expect(field('text', 'a')).toBeUndefined();
      expect(field(undefined, 'a')).toBeUndefined();
    });

    it('requiredString and checkBaseUrl should validate', () => {
      expect(requiredString('k', 'T', 'apiKey')).toBe('k');
      expect(() => requiredString('', 'T', 'apiKey')).toThrow(
        'T `apiKey` is required',
      );
      expect(() => requiredString(1, 'T', 'apiKey')).toThrow(TypeError);
      expect(checkBaseUrl('https://[::1]/', 'T')).toBe('https://[::1]');
      expect(checkBaseUrl('http://127.0.0.1:8080', 'T')).toBe(
        'http://127.0.0.1:8080',
      );
    });

    it('the barrel should export the public API', () => {
      expect(
        Object.entries(barrel)
          .filter(([, value]) => typeof value === 'function')
          .map(([name]) => name)
          .sort(),
      ).toEqual([
        'BrevoTransport',
        'HttpProviderTransport',
        'MailgunTransport',
        'PostmarkTransport',
        'ResendTransport',
        'SendGridTransport',
        'SesTransport',
        'parseRetryAfter',
        'signV4',
      ]);
    });
  });
});
