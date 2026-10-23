import { parseRetryAfter } from './retry-after';

describe('parseRetryAfter', () => {
  const now = Date.parse('2015-10-21T07:28:00Z');

  it('should read a delay in seconds', () => {
    expect(parseRetryAfter('120', now)).toBe(120_000);
    expect(parseRetryAfter(' 0 ', now)).toBe(0);
    expect(parseRetryAfter('1.5', now)).toBe(1500);
  });

  it('should read the three HTTP-date forms as GMT', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('Wednesday, 21-Oct-15 07:28:30 GMT', now)).toBe(
      30_000,
    );
    expect(parseRetryAfter('Wed Oct 21 07:28:30 2015', now)).toBe(30_000);
  });

  it('should clamp a date in the past to 0', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:00:00 GMT', now)).toBe(0);
  });

  it('should ignore absent and malformed values', () => {
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter('', now)).toBeUndefined();
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter('-5', now)).toBeUndefined();
    expect(
      parseRetryAfter('Wed, 99 Foo 2015 07:28:30 GMT', now),
    ).toBeUndefined();
  });

  it('should default to the current time', () => {
    const inAMinute = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfter(inAMinute) as number;
    expect(ms).toBeGreaterThan(55_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });
});
