import {
  buildRaw,
  CapturedMail,
  NodemailerMail,
  rawHeader,
} from './captured-mail';

function fakeMail(
  data: Record<string, any>,
  overrides: Partial<NodemailerMail['message']> = {},
): NodemailerMail {
  return {
    data,
    message: {
      build: (callback) => callback(null, Buffer.from('Subject: raw\n\nbody')),
      getEnvelope: () => ({
        from: 'from@example.test',
        to: ['a@example.test'],
      }),
      messageId: () => '<id@example.test>',
      ...overrides,
    },
  };
}

class WelcomeMail {}

describe('captured-mail', () => {
  describe('buildRaw', () => {
    it('should resolve with the built MIME source', async () => {
      await expect(buildRaw(fakeMail({}))).resolves.toEqual(
        Buffer.from('Subject: raw\n\nbody'),
      );
    });

    it('should reject when the message fails to build', async () => {
      const error = new Error('cannot build');
      const mail = fakeMail(
        {},
        { build: (callback) => callback(error, Buffer.alloc(0)) },
      );

      await expect(buildRaw(mail)).rejects.toBe(error);
    });
  });

  describe('CapturedMail', () => {
    it('should expose the fields as sent', () => {
      const attachments = [{ filename: 'a.txt', content: 'A' }];
      const mail = new CapturedMail(
        fakeMail({
          from: '"Sender" <sender@example.test>',
          to: [
            'Ada <ada@example.test>',
            { name: 'Bo', address: 'bo@example.test' },
          ],
          cc: 'cc@example.test',
          bcc: 'bcc@example.test',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: Buffer.from('Hi'),
          template: 'welcome',
          context: { name: 'Ada' },
          locale: 'es',
          headers: { 'X-Test': '1' },
          attachments,
          mailable: WelcomeMail,
        }),
        Buffer.from('raw source'),
      );

      expect(mail).toMatchObject({
        messageId: '<id@example.test>',
        from: 'sender@example.test',
        to: ['ada@example.test', 'bo@example.test'],
        cc: ['cc@example.test'],
        bcc: ['bcc@example.test'],
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
        template: 'welcome',
        context: { name: 'Ada' },
        locale: 'es',
        headers: { 'X-Test': '1' },
        attachments,
        mailable: WelcomeMail,
        envelope: { from: 'from@example.test', to: ['a@example.test'] },
        raw: 'raw source',
      });
      expect(mail.sentAt).toBeInstanceOf(Date);
    });

    it('should default missing fields', () => {
      const mail = new CapturedMail(
        fakeMail({ html: { path: '/tmp/body.html' } }),
        Buffer.from(''),
      );

      expect(mail.from).toBeUndefined();
      expect(mail.to).toEqual([]);
      expect(mail.cc).toEqual([]);
      expect(mail.bcc).toEqual([]);
      // Bodies that are not strings or buffers (streams, paths) are not read
      expect(mail.html).toBeUndefined();
      expect(mail.text).toBeUndefined();
      expect(mail.attachments).toEqual([]);
      expect(mail.mailable).toBeUndefined();
    });

    describe('links', () => {
      it('should return no links without an HTML body', () => {
        expect(new CapturedMail(fakeMail({}), Buffer.from('')).links).toEqual(
          [],
        );
      });

      it('should list every href with entities decoded', () => {
        const mail = new CapturedMail(
          fakeMail({
            html:
              '<a href="https://example.test/verify?a=1&amp;b=2">x</a>' +
              "<a HREF = '/reset?q=&lt;&gt;&quot;&#39;&#x27;'>y</a>",
          }),
          Buffer.from(''),
        );

        expect(mail.links).toEqual([
          'https://example.test/verify?a=1&b=2',
          `/reset?q=<>"''`,
        ]);
      });
    });

    describe('link', () => {
      const mail = new CapturedMail(
        fakeMail({
          subject: 'Verify',
          html: '<a href="/home">h</a><a href="https://app.test/verify?token=abc">v</a>',
        }),
        Buffer.from(''),
      );

      it('should find a link containing a string, parsed as a URL', () => {
        const url = mail.link('/verify');
        expect(url.host).toBe('app.test');
        expect(url.searchParams.get('token')).toBe('abc');
      });

      it('should find a link matching a RegExp, resolving relative links', () => {
        expect(mail.link(/^\/home$/).href).toBe('http://localhost/home');
      });

      it('should throw listing the links when none matches', () => {
        expect(() => mail.link('/missing')).toThrow(
          'No link matching /missing in "Verify". Links: /home, https://app.test/verify?token=abc',
        );
      });

      it('should say there are no links when the email has none', () => {
        const empty = new CapturedMail(
          fakeMail({ subject: 'Plain' }),
          Buffer.from(''),
        );
        expect(() => empty.link(/x/)).toThrow(
          'No link matching /x/ in "Plain". Links: (none)',
        );
      });
    });

    describe('attachment', () => {
      it('should return the attachment with the filename', () => {
        const report = { filename: 'report.pdf', content: 'pdf' };
        const mail = new CapturedMail(
          fakeMail({ attachments: [{ filename: 'a.txt' }, report] }),
          Buffer.from(''),
        );

        expect(mail.attachment('report.pdf')).toBe(report);
      });

      it('should throw listing the attachments when none matches', () => {
        const mail = new CapturedMail(
          fakeMail({ subject: 'Docs', attachments: [{ filename: 'a.txt' }] }),
          Buffer.from(''),
        );

        expect(() => mail.attachment('b.txt')).toThrow(
          'No attachment "b.txt" in "Docs". Attachments: a.txt',
        );
      });

      it('should say there are no attachments when the email has none', () => {
        const mail = new CapturedMail(
          fakeMail({ subject: 'Docs' }),
          Buffer.from(''),
        );

        expect(() => mail.attachment('b.txt')).toThrow(
          'No attachment "b.txt" in "Docs". Attachments: (none)',
        );
      });
    });
  });

  describe('raw messages', () => {
    const raw = [
      'From: App <app@example.test>',
      'To: Ada <ada@example.test>,',
      ' bob@example.test',
      'Cc: =?UTF-8?B?Sm9zw6k=?= <jose@example.test>',
      'Subject: =?UTF-8?Q?Caf=C3=A9_ready?= =?UTF-8?Q?_now?=',
      'X-Latin: =?ISO-8859-1?Q?=E9t=E9?=',
      '',
      'Subject: not a header',
    ].join('\r\n');

    it('should read unfolded, decoded headers', () => {
      expect(rawHeader(raw, 'subject')).toBe('Café ready now');
      expect(rawHeader(raw, 'To')).toBe(
        'Ada <ada@example.test>, bob@example.test',
      );
      expect(rawHeader(raw, 'Cc')).toBe('José <jose@example.test>');
      expect(rawHeader(raw, 'X-Latin')).toBe('été');
      expect(rawHeader(raw, 'Reply-To')).toBeUndefined();
    });

    it('should take the fields of a raw email from its MIME', () => {
      const mail = new CapturedMail(
        fakeMail({ raw }, { build: (cb) => cb(null, Buffer.from(raw)) }),
        Buffer.from(raw),
      );

      expect(mail.from).toBe('app@example.test');
      expect(mail.to).toEqual(['ada@example.test', 'bob@example.test']);
      expect(mail.cc).toEqual(['jose@example.test']);
      expect(mail.subject).toBe('Café ready now');
    });

    it('should prefer the fields given over the MIME', () => {
      const mail = new CapturedMail(
        fakeMail({ raw, subject: 'Given' }),
        Buffer.from(raw),
      );
      expect(mail.subject).toBe('Given');
    });
  });
});
