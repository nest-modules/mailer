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

/** Elements whose content is never part of the text */
const DROPPED = ['head', 'style', 'script', 'title'];

/**
 * Removes comments and the dropped elements with their content. A linear scan
 * with `indexOf` rather than lazy regular expressions, which backtrack
 * polynomially on input full of unclosed `<!--` or `<script`.
 */
function removeBlocks(html: string): string {
  const lower = html.toLowerCase();
  let result = '';
  let index = 0;
  while (index < html.length) {
    const open = lower.indexOf('<', index);
    if (open === -1) break;
    result += html.slice(index, open);
    if (lower.startsWith('<!--', open)) {
      const close = lower.indexOf('-->', open + 4);
      // An unclosed comment hides the rest of the document, as in a browser
      index = close === -1 ? html.length : close + 3;
      continue;
    }
    const name = DROPPED.find(
      (tag) =>
        lower.startsWith(tag, open + 1) &&
        !/[a-z0-9-]/.test(lower.charAt(open + 1 + tag.length)),
    );
    if (name) {
      const close = lower.indexOf(`</${name}`, open);
      const end = close === -1 ? -1 : lower.indexOf('>', close);
      index = end === -1 ? html.length : end + 1;
      continue;
    }
    result += '<';
    index = open + 1;
  }
  return result + html.slice(index);
}

/** Strips tags until none is left, so `<<b>script>` can't leave a tag behind */
function stripTags(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, '');
  } while (current !== previous);
  return current;
}

/**
 * The plain-text version of an HTML email, for its `text/plain` part:
 * paragraphs and line breaks kept, links written as `text (url)`, list items
 * as `- item`, head, styles and scripts dropped, entities decoded.
 * Mailbox providers score email without a text part as more likely spam.
 */
export function htmlToText(html: string): string {
  const text = removeBlocks(html)
    .replace(
      /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
      (_, _q, href: string, label: string) => {
        const inner = stripTags(label).trim();
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
    .replace(/<\/(td|th)\s*>/gi, ' ');

  // The result is a text/plain body: decoded entities such as `&lt;` are
  // literal text there, never markup
  return decode(stripTags(text))

    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
