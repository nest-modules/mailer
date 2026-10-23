// The three HTTP-date forms (RFC 9110 §5.6.7). `Date.parse()` alone reads almost
// anything as a date ("1.5" is January 2001), so only these shapes are accepted.
const IMF_FIXDATE =
  /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const RFC850_DATE =
  /^[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT$/;
const ASCTIME_DATE =
  /^[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/;

/**
 * A `Retry-After` header (delay in seconds, or an HTTP date) as milliseconds
 * from `now`. `undefined` when it is absent or malformed; a date in the past is 0.
 *
 * @example parseRetryAfter('120') // 120000
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  let date = Number.NaN;
  if (IMF_FIXDATE.test(trimmed) || RFC850_DATE.test(trimmed)) {
    date = Date.parse(trimmed);
  } else if (ASCTIME_DATE.test(trimmed)) {
    // asctime carries no zone, and HTTP dates are always GMT
    date = Date.parse(`${trimmed} GMT`);
  }
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
