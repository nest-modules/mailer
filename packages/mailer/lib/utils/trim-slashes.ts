/**
 * Removes leading and/or trailing `/`. A loop rather than `/^\/+|\/+$/`,
 * which backtracks polynomially on long runs of slashes.
 */
export function trimSlashes(
  value: string,
  { start = true, end = true }: { start?: boolean; end?: boolean } = {},
): string {
  let from = 0;
  let to = value.length;
  if (start) while (from < to && value.charCodeAt(from) === 47) from++;
  if (end) while (to > from && value.charCodeAt(to - 1) === 47) to--;
  return value.slice(from, to);
}
