import { escapeHtml } from './interpolate';

const SAFE = Symbol.for('@nestjs-modules/mailer:safe-html');

/** HTML whose interpolated values were escaped by the `html` tag, or trusted with `unsafeHtml()` */
export class SafeHtml {
  readonly [SAFE] = true;

  constructor(private readonly value: string) {}

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

export function isSafeHtml(value: unknown): value is SafeHtml {
  return typeof value === 'object' && value !== null && SAFE in value;
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isSafeHtml(value)) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

/**
 * A tagged template for email bodies that escapes every interpolated value,
 * so user data can't inject markup. Arrays are joined; `null`, `undefined`
 * and `false` render nothing; nested `html` and `unsafeHtml()` values are kept.
 *
 * @example
 * ```typescript
 * await mailer.sendMail({
 *   to, subject: 'Welcome',
 *   html: html`<p>Hi ${user.name}</p><ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`,
 * });
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SafeHtml {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    result += render(values[i]) + strings[i + 1];
  }
  return new SafeHtml(result);
}

/** Marks trusted HTML (from your own templates, never from users) to insert as is */
export function unsafeHtml(value: string): SafeHtml {
  return new SafeHtml(value);
}
