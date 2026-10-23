import {
  addressesOf,
  applyIntercept,
  applySuppression,
  applyUnsubscribe,
  messageIdFor,
  parseAddresses,
  recipientsOf,
  withHeader,
} from './recipients';

describe('recipient utilities', () => {
  describe('addressesOf', () => {
    it('should return nothing for a missing field', () => {
      expect(addressesOf(undefined)).toEqual([]);
      expect(addressesOf(null as any)).toEqual([]);
    });

    it('should parse strings, lists, display names and objects', () => {
      expect(
        addressesOf([
          'Ada <ada@example.com>, bob@example.com',
          { name: 'Cy', address: 'cy@example.com' },
          { name: 'No address', address: '' },
          'Undisclosed:;',
          null as any,
        ]),
      ).toEqual(['ada@example.com', 'bob@example.com', 'cy@example.com']);
    });

    it('should accept a single object', () => {
      expect(addressesOf({ name: 'Ada', address: 'ada@example.com' })).toEqual([
        'ada@example.com',
      ]);
    });
  });

  describe('parseAddresses', () => {
    it('should parse every format into name and address', () => {
      expect(
        parseAddresses([
          'Ada <ada@x.com>, bob@x.com',
          { name: 'Cy', address: 'cy@x.com' },
          { name: '', address: 'dee@x.com' },
          { name: 'Nobody', address: '' },
          null as any,
        ]),
      ).toEqual([
        { name: 'Ada', address: 'ada@x.com' },
        { address: 'bob@x.com' },
        { name: 'Cy', address: 'cy@x.com' },
        { address: 'dee@x.com' },
      ]);
      expect(parseAddresses('a@x.com')).toEqual([{ address: 'a@x.com' }]);
      expect(parseAddresses(undefined)).toEqual([]);
      expect(parseAddresses(null as any)).toEqual([]);
    });
  });

  describe('custom envelopes', () => {
    const envelope = {
      from: 'app@corp.test',
      to: 'dev@corp.test',
      cc: 'blocked@x.com',
      bcc: ['customer@real.com'],
    };

    it('should count every envelope recipient', () => {
      expect(recipientsOf({ envelope } as any)).toEqual([
        'dev@corp.test',
        'blocked@x.com',
        'customer@real.com',
      ]);
      expect(recipientsOf({ envelope: { from: 'x@y.z' } } as any)).toEqual([]);
    });

    it('should suppress envelope cc and bcc too', async () => {
      const result = await applySuppression(
        { raw: 'MIME', envelope } as any,
        (a) => ['blocked@x.com', 'customer@real.com'].includes(a),
      );
      expect(result.mail.envelope).toEqual({
        from: 'app@corp.test',
        to: ['dev@corp.test'],
        cc: [],
        bcc: [],
      });
    });

    it('should intercept envelope cc and bcc too', async () => {
      const result = await applyIntercept({ raw: 'MIME', envelope } as any, {
        to: 'qa@corp.test',
        allow: ['@corp.test'],
      });
      expect(result.envelope).toEqual({
        from: 'app@corp.test',
        to: ['dev@corp.test', 'qa@corp.test'],
        cc: [],
        bcc: [],
      });
    });

    it('should add the intercept inbox to an envelope without `to`', async () => {
      const result = await applyIntercept(
        {
          raw: 'MIME',
          envelope: { from: 'a@corp.test', bcc: 'x@real.com' },
        } as any,
        { to: 'qa@corp.test' },
      );
      expect(result.envelope).toEqual({
        from: 'a@corp.test',
        bcc: [],
        to: ['qa@corp.test'],
      });
    });
  });

  describe('recipientsOf', () => {
    it('should collect to, cc, bcc and the envelope', () => {
      expect(
        recipientsOf({
          to: 'a@example.com',
          cc: ['b@example.com'],
          bcc: { name: 'C', address: 'c@example.com' },
          envelope: { from: 'x@example.com', to: ['d@example.com'] },
        }),
      ).toEqual([
        'a@example.com',
        'b@example.com',
        'c@example.com',
        'd@example.com',
      ]);
    });

    it('should handle an email without recipients', () => {
      expect(recipientsOf({})).toEqual([]);
    });
  });

  describe('applySuppression', () => {
    const suppressed = new Set(['blocked@example.com', 'gone@example.com']);
    const suppress = jest.fn(async (address: string) =>
      suppressed.has(address),
    );

    it('should drop suppressed recipients from every field', async () => {
      const mail = {
        to: 'Blocked <blocked@example.com>, Ada <ada@example.com>',
        cc: [{ name: 'Gone', address: 'gone@example.com' }, 'bob@example.com'],
        bcc: 'blocked@example.com',
        subject: 'Hi',
      };

      const result = await applySuppression(mail, suppress);

      expect(result.mail).toEqual({
        to: [{ name: 'Ada', address: 'ada@example.com' }],
        cc: ['bob@example.com'],
        bcc: [],
        subject: 'Hi',
      });
      expect(result.suppressed).toEqual([
        'blocked@example.com',
        'gone@example.com',
      ]);
      expect(suppress).toHaveBeenCalledWith('ada@example.com', mail);
    });

    it('should drop entries without an address', async () => {
      const result = await applySuppression(
        {
          to: [null as any, { name: 'Nobody', address: '' }, 'Undisclosed:;'],
        },
        suppress,
      );
      expect(result.mail.to).toEqual([]);
    });

    it('should filter the envelope of raw messages', async () => {
      const result = await applySuppression(
        {
          raw: 'MIME',
          envelope: {
            from: 'app@example.com',
            to: ['blocked@example.com', 'ada@example.com'],
          },
        },
        suppress,
      );

      expect(result.mail.envelope).toEqual({
        from: 'app@example.com',
        to: ['ada@example.com'],
      });
    });

    it('should leave fields that are not set alone', async () => {
      const result = await applySuppression(
        { to: 'ada@example.com', envelope: { from: 'x@example.com' } as any },
        suppress,
      );
      expect(result.mail).toEqual({
        to: ['ada@example.com'],
        envelope: { from: 'x@example.com' },
      });
      expect(result.suppressed).toEqual([]);
    });
  });

  describe('applyIntercept', () => {
    it('should replace recipients that are not allowed', async () => {
      const result = await applyIntercept(
        {
          to: ['customer@gmail.com', 'dev@company.com'],
          cc: 'Boss <boss@partner.com>',
          bcc: 'qa@company.com',
          subject: 'Invoice',
          headers: { 'X-Tenant': 'acme' },
        },
        {
          to: 'inbox@company.com',
          allow: ['@company.com', /@partner\.com$/i],
          subjectPrefix: '[STAGING] ',
        },
      );

      expect(result).toEqual({
        to: ['dev@company.com', 'inbox@company.com'],
        cc: [{ name: 'Boss', address: 'boss@partner.com' }],
        bcc: ['qa@company.com'],
        subject: '[STAGING] Invoice',
        headers: {
          'X-Tenant': 'acme',
          'X-Intercepted-Recipients': 'customer@gmail.com',
        },
      });
    });

    it('should keep allowed recipients given as objects', async () => {
      const result = await applyIntercept(
        { to: [{ name: 'Dev', address: 'dev@company.com' }, 'x@gmail.com'] },
        { to: 'inbox@company.com', allow: ['@company.com'] },
      );
      expect(result.to).toEqual([
        { name: 'Dev', address: 'dev@company.com' },
        'inbox@company.com',
      ]);
    });

    it('should match exact addresses case-insensitively', async () => {
      const mail = { to: 'Ada@Example.com' };
      const result = await applyIntercept(mail, {
        to: 'inbox@company.com',
        allow: ['ada@example.com'],
      });
      expect(result).toBe(mail);
    });

    it('should return the email unchanged when nothing is intercepted', async () => {
      const mail = { to: 'dev@company.com', subject: 'Hi' };
      await expect(
        applyIntercept(mail, {
          to: 'inbox@company.com',
          allow: ['@company.com'],
        }),
      ).resolves.toBe(mail);
    });

    it('should do nothing when disabled', async () => {
      const mail = { to: 'customer@gmail.com' };
      await expect(
        applyIntercept(mail, { to: 'inbox@company.com', enabled: false }),
      ).resolves.toBe(mail);
    });

    it('should intercept everyone without an allow list, to several inboxes', async () => {
      const result = await applyIntercept(
        { cc: 'a@x.com', headers: [{ key: 'X-A', value: '1' }] },
        { to: ['one@company.com', 'two@company.com'] },
      );

      expect(result).toEqual({
        cc: [],
        to: ['one@company.com', 'two@company.com'],
        headers: [
          { key: 'X-A', value: '1' },
          { key: 'X-Intercepted-Recipients', value: 'a@x.com' },
        ],
      });
    });

    it('should not prefix a missing subject', async () => {
      const result = await applyIntercept(
        { to: 'a@x.com' },
        { to: 'inbox@company.com', subjectPrefix: '[QA] ' },
      );
      expect(result.subject).toBeUndefined();
    });

    it('should redirect the envelope of raw messages', async () => {
      const result = await applyIntercept(
        {
          raw: 'MIME',
          envelope: { from: 'app@x.com', to: ['a@x.com', 'a@x.com'] },
        },
        { to: 'inbox@company.com' },
      );

      expect(result.envelope).toEqual({
        from: 'app@x.com',
        to: ['inbox@company.com'],
      });
      expect(result.to).toEqual(['inbox@company.com']);
      expect(result.headers).toEqual({ 'X-Intercepted-Recipients': 'a@x.com' });
    });
  });

  describe('withHeader', () => {
    it('should add to the object format, creating it when missing', () => {
      expect(withHeader(undefined, 'X-A', '1')).toEqual({ 'X-A': '1' });
      expect(withHeader({ 'X-B': '2' }, 'X-A', '1')).toEqual({
        'X-B': '2',
        'X-A': '1',
      });
    });

    it('should add to the array format', () => {
      expect(withHeader([{ key: 'X-B', value: '2' }], 'X-A', '1')).toEqual([
        { key: 'X-B', value: '2' },
        { key: 'X-A', value: '1' },
      ]);
    });
  });

  describe('applyUnsubscribe', () => {
    it('should add both links and the one-click header', () => {
      expect(
        applyUnsubscribe(
          {
            subject: 'News',
            list: { help: 'https://example.com/help' },
            unsubscribe: {},
          },
          {
            url: 'https://example.com/u/1',
            mailto: 'unsubscribe@example.com',
          },
        ),
      ).toEqual({
        subject: 'News',
        list: {
          help: 'https://example.com/help',
          unsubscribe: [
            'https://example.com/u/1',
            'mailto:unsubscribe@example.com',
          ],
        },
        headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
    });

    it('should keep a mailto: prefix and skip one-click without a url', () => {
      expect(applyUnsubscribe({}, { mailto: 'mailto:u@example.com' })).toEqual({
        list: { unsubscribe: ['mailto:u@example.com'] },
      });
    });

    it('should skip one-click when turned off', () => {
      expect(
        applyUnsubscribe({}, { url: 'https://example.com/u', oneClick: false }),
      ).toEqual({ list: { unsubscribe: ['https://example.com/u'] } });
    });

    it('should need a url or a mailto', () => {
      expect(() => applyUnsubscribe({}, {})).toThrow(
        'unsubscribe needs a `url`, a `mailto`, or both',
      );
    });

    it('should need a url for one-click', () => {
      expect(() =>
        applyUnsubscribe({}, { mailto: 'u@example.com', oneClick: true }),
      ).toThrow('unsubscribe.oneClick needs an HTTPS `url`');
    });
  });

  describe('messageIdFor', () => {
    it("should be stable for a key and use the sender's domain", () => {
      const id = messageIdFor('order-42', 'Shop <shop@example.com>');
      expect(id).toMatch(/^<[0-9a-f]{32}@example\.com>$/);
      expect(messageIdFor('order-42', 'shop@example.com')).toBe(id);
      expect(messageIdFor('order-43', 'shop@example.com')).not.toBe(id);
    });

    it('should fall back to a local domain without a sender', () => {
      expect(messageIdFor('k', undefined)).toMatch(
        /^<[0-9a-f]{32}@nestjs-mailer\.local>$/,
      );
      expect(messageIdFor('k', 'not-an-address')).toMatch(
        /@nestjs-mailer\.local>$/,
      );
    });
  });
});
