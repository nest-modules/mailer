const PLACEHOLDER = /\{\{\{([^{}]+)\}\}\}|\{\{([^{}]+)\}\}/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Replace `{{key}}` placeholders with values from `context`.
 *
 * - Only own properties of `context` are used, so prototype members such as
 *   `constructor` or `__proto__` are never rendered.
 * - Unknown keys are left in place as `{{key}}`.
 * - With `escape`, `{{key}}` is HTML-escaped and `{{{key}}}` is inserted raw.
 *   Without it both forms are inserted raw.
 */
export function interpolate(
  template: string,
  context: Record<string, any>,
  { escape: escapeValues = false }: { escape?: boolean } = {},
): string {
  return template.replace(PLACEHOLDER, (_, rawKey, key) => {
    const name = (rawKey ?? key).trim();
    if (!Object.hasOwn(context, name) || context[name] === undefined) {
      return rawKey === undefined ? `{{${name}}}` : `{{{${name}}}}`;
    }
    const value = String(context[name]);
    return escapeValues && rawKey === undefined ? escapeHtml(value) : value;
  });
}
