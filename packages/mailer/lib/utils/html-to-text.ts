const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decode(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x'
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/**
 * The plain-text version of an HTML email, for its `text/plain` part:
 * paragraphs and line breaks kept, links written as `text (url)`, list items
 * as `- item`, head, styles and scripts dropped, entities decoded.
 * Mailbox providers score email without a text part as more likely spam.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(
      /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
      (_, _q, href: string, label: string) => {
        const inner = label.replace(/<[^>]+>/g, '').trim();
        const url = decode(href);
        if (!inner || decode(inner) === url) return url;
        return /^(mailto:|tel:|#|javascript:)/i.test(url)
          ? inner
          : `${inner} (${url})`;
      },
    )
    .replace(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, '$2')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(
      /<\/?(p|div|h[1-6]|ul|ol|table|tr|blockquote|section|article|header|footer)\b[^>]*>/gi,
      '\n\n',
    )
    .replace(/<\/(td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  return decode(text)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
