import { MailerMessageError } from '../errors/mailer.errors';
import { validateMessage } from './validate-message';

describe('validateMessage', () => {
  const invalid = (
    mail: Parameters<typeof validateMessage>[0],
    field: string,
  ) => {
    let error: unknown;
    try {
      validateMessage(mail);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MailerMessageError);
    expect((error as MailerMessageError).field).toBe(field);
  };

  it('should accept a valid email in every address format', () => {
    expect(() =>
      validateMessage({
        from: 'App <app@example.com>',
        to: [
          'ada@example.com, bob@example.com',
          { name: 'Cy', address: 'cy@x.io' },
        ],
        cc: 'Undisclosed recipients:;',
        bcc: null as any,
        replyTo: { name: 'Help', address: 'help@example.com' },
        subject: 'Hello',
        headers: [{ key: 'X-Tag', value: 'a' }],
      }),
    ).not.toThrow();
    expect(() => validateMessage({})).not.toThrow();
  });

  it('should reject malformed addresses', () => {
    invalid({ to: 'not-an-address' }, 'to');
    invalid({ cc: [{ name: 'X', address: 'x' }] }, 'cc');
    invalid({ bcc: [{ name: 'X' } as any] }, 'bcc');
    invalid({ bcc: ['ok@x.com', 42 as any, { address: 'bad' }] }, 'bcc');
    invalid({ from: 'user@' }, 'from');
    invalid({ replyTo: 'a@b@c' }, 'replyTo');
  });

  it('should reject line breaks that could inject headers', () => {
    invalid({ to: 'ada@example.com\r\nBcc: x@evil.com' }, 'to');
    invalid(
      { to: { name: 'Ada\nBcc: x@evil.com', address: 'ada@x.com' } },
      'to',
    );
    invalid({ subject: 'Hi\r\nBcc: x@evil.com' }, 'subject');
    invalid({ headers: { 'X-A': 'a\nb' } }, 'headers');
    invalid({ headers: { 'X-A': ['ok', 'a\rb'] } }, 'headers');
    invalid(
      { headers: { 'X-A': { prepared: false, value: 'a\nb' } } },
      'headers',
    );
  });

  it('should reject invalid header names', () => {
    invalid({ headers: { 'X A': 'a' } }, 'headers');
    invalid({ headers: [{ key: 'X:A', value: 'a' }] }, 'headers');
  });

  it('should accept prepared header values as given', () => {
    expect(() =>
      validateMessage({
        headers: { 'X-Folded': { prepared: true, value: 'a\r\n b' } },
      }),
    ).not.toThrow();
  });
});
