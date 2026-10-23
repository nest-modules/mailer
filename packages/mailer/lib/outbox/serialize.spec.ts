import { Readable } from 'node:stream';
import {
  BUFFER_TAG,
  fromStorable,
  toOutboxPayload,
  toStorable,
} from './serialize';

class WelcomeMail {
  render() {
    return { subject: 'Welcome' };
  }
}

const names = new Map<any, string>([[WelcomeMail, 'welcome']]);

describe('toStorable', () => {
  it('keeps JSON values and drops undefined properties', () => {
    expect(toStorable(null, 'x')).toBeNull();
    expect(toStorable(undefined, 'x')).toBeUndefined();
    expect(
      toStorable(
        { a: 'text', b: true, c: 1.5, d: undefined, e: [1, undefined] },
        'x',
      ),
    ).toEqual({ a: 'text', b: true, c: 1.5, e: [1, null] });
  });

  it('stores binary values as tagged base64', () => {
    expect(toStorable(Buffer.from('hi'), 'x')).toEqual({
      [BUFFER_TAG]: 'aGk=',
    });
    const bytes = new Uint8Array([0, 1, 2, 3]).subarray(1, 3);
    expect(toStorable(bytes, 'x')).toEqual({ [BUFFER_TAG]: 'AQI=' });
  });

  it('honors toJSON()', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(toStorable({ date }, 'mail')).toEqual({
      date: '2026-01-02T03:04:05.000Z',
    });
  });

  it('accepts the same object twice when it is not a cycle', () => {
    const shared = { name: 'Ada' };
    expect(toStorable({ a: shared, b: [shared] }, 'x')).toEqual({
      a: { name: 'Ada' },
      b: [{ name: 'Ada' }],
    });
  });

  it.each([
    [Number.NaN, /mail\.value is NaN/],
    [Number.POSITIVE_INFINITY, /mail\.value is Infinity/],
    [() => 1, /mail\.value is a function/],
    [BigInt(1), /mail\.value is a bigint/],
    [Symbol('s'), /mail\.value is a symbol/],
    [Readable.from(['x']), /mail\.value is a stream/],
    [new Map(), /mail\.value is a Map/],
    [new Set(), /mail\.value is a Set/],
  ])('refuses %p', (value, message) => {
    expect(() => toStorable({ value }, 'mail')).toThrow(TypeError);
    expect(() => toStorable({ value }, 'mail')).toThrow(message);
  });

  it('refuses cycles', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => toStorable(cycle, 'mail')).toThrow(
      'MailerOutbox: mail.self is circular',
    );
  });
});

describe('fromStorable', () => {
  it('brings tagged base64 back as Buffers, deeply', () => {
    const restored = fromStorable({
      html: { [BUFFER_TAG]: 'aGk=' },
      list: [{ [BUFFER_TAG]: 'AQI=' }, 'text'],
      n: 1,
      none: null,
    }) as any;
    expect(Buffer.isBuffer(restored.html)).toBe(true);
    expect(restored.html.toString()).toBe('hi');
    expect([...restored.list[0]]).toEqual([1, 2]);
    expect(restored.list[1]).toBe('text');
    expect(restored.n).toBe(1);
    expect(restored.none).toBeNull();
  });

  it('leaves look-alikes alone', () => {
    const value = {
      a: { [BUFFER_TAG]: 1 },
      b: { [BUFFER_TAG]: 'aGk=', other: true },
    };
    expect(fromStorable(value)).toEqual(value);
  });

  it('round-trips toStorable()', () => {
    const mail = { raw: Buffer.from('MIME'), context: { n: [1, 2] } };
    expect(fromStorable(toStorable(mail, 'mail'))).toEqual(mail);
  });
});

describe('toOutboxPayload', () => {
  it('stores inline send options, with binary content as base64', () => {
    const payload = toOutboxPayload(
      {
        to: 'ada@example.com',
        subject: 'Hi',
        attachments: [
          { filename: 'a.txt', content: Buffer.from('hello') },
          { filename: 'b.txt', content: 'plain' },
          { filename: 'c.txt', path: '/tmp/c.txt' },
        ],
        icalEvent: { method: 'REQUEST', content: Buffer.from('BEGIN') },
        mailable: WelcomeMail,
      },
      names,
    );
    expect(payload).toEqual({
      v: 1,
      mail: {
        to: 'ada@example.com',
        subject: 'Hi',
        attachments: [
          { filename: 'a.txt', content: 'aGVsbG8=', encoding: 'base64' },
          { filename: 'b.txt', content: 'plain' },
          { filename: 'c.txt', path: '/tmp/c.txt' },
        ],
        icalEvent: {
          method: 'REQUEST',
          content: 'QkVHSU4=',
          encoding: 'base64',
        },
      },
    });
  });

  it('stores a mail class by its registered name', () => {
    expect(
      toOutboxPayload(
        {
          mail: WelcomeMail,
          to: 'ada@example.com',
          data: { name: 'Ada' },
          locale: 'es',
        },
        names,
      ),
    ).toEqual({
      v: 1,
      mailable: 'welcome',
      options: { to: 'ada@example.com', data: { name: 'Ada' }, locale: 'es' },
    });
  });

  it('passes non-array attachments to the JSON check', () => {
    expect(
      toOutboxPayload({ attachments: 'nope' as any }, names),
    ).toMatchObject({ mail: { attachments: 'nope' } });
  });

  it.each([null, 'text', ['to']])('refuses %p as an email', (mail) => {
    expect(() => toOutboxPayload(mail as any, names)).toThrow(
      'MailerOutbox.add() needs send options',
    );
  });

  it('refuses process-only options', () => {
    expect(() =>
      toOutboxPayload({ signal: new AbortController().signal }, names),
    ).toThrow(/mail\.signal is an AbortSignal/);
    expect(() =>
      toOutboxPayload({ mail: WelcomeMail, retry: 3 } as any, names),
    ).toThrow(/options\.retry cannot be stored/);
  });

  it('refuses a `mail` that is not a class', () => {
    expect(() =>
      toOutboxPayload({ mail: 'WelcomeMail' } as any, names),
    ).toThrow('`mail` must be a mail class');
  });

  it('refuses a mail class missing from `mailables`', () => {
    class OtherMail {
      render() {
        return {};
      }
    }
    expect(() => toOutboxPayload({ mail: OtherMail } as any, names)).toThrow(
      "OtherMail is not in MailerOutboxModule's `mailables`",
    );
    const anonymous = (() => class {})();
    expect(() => toOutboxPayload({ mail: anonymous } as any, names)).toThrow(
      'the mail class is not in',
    );
  });
});
