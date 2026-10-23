// Lightweight, browser-only template renderers used by the Template Preview
// page. Handlebars is the real library; EJS and Pug are small approximations
// that cover the syntax used in the sample templates.

export type Adapter = 'handlebars' | 'ejs' | 'pug';

type Context = Record<string, unknown>;

export function renderEjs(template: string, data: Context): string {
  let fnBody = "let __output = '';\n";

  for (const key of Object.keys(data)) {
    fnBody += `const ${key} = __data[${JSON.stringify(key)}];\n`;
  }

  let cursor = 0;
  const re = /<%([=-]?)([\s\S]*?)%>/g;
  for (const match of template.matchAll(re)) {
    const index = match.index ?? 0;
    const text = template.slice(cursor, index);
    if (text) {
      fnBody += `__output += ${JSON.stringify(text)};\n`;
    }
    cursor = index + match[0].length;

    const flag = match[1];
    const code = match[2].trim();
    if (flag === '=' || flag === '-') {
      fnBody += `__output += String(${code});\n`;
    } else {
      fnBody += `${code}\n`;
    }
  }

  if (cursor < template.length) {
    fnBody += `__output += ${JSON.stringify(template.slice(cursor))};\n`;
  }
  fnBody += 'return __output;';

  const fn = new Function('__data', fnBody);
  return fn(data);
}

const VOID_TAGS = ['img', 'br', 'hr', 'input', 'meta', 'link'];

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, '  ').length : 0;
}

export function renderPug(template: string, data: Context): string {
  const lines = template.split('\n');
  const result: string[] = [];
  const stack: { indent: number; tag: string }[] = [];

  const interpolate = (text: string): string =>
    text.replace(/#\{([^}]+)\}/g, (_, expr: string) => {
      try {
        const fn = new Function(...Object.keys(data), `return ${expr}`);
        return String(fn(...Object.values(data)));
      } catch {
        return '';
      }
    });

  const closeTagsToIndent = (indent: number) => {
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      const item = stack.pop();
      if (item && !VOID_TAGS.includes(item.tag)) {
        result.push(`</${item.tag}>`);
      }
    }
  };

  // Collects the indented block that follows line `start`.
  const collectBlock = (start: number, fallbackIndent: number) => {
    const blockIndent =
      start < lines.length ? getIndent(lines[start]) : fallbackIndent;
    const body: string[] = [];
    let j = start;
    while (j < lines.length) {
      const current = lines[j];
      if (
        current.trim() === '' &&
        j + 1 < lines.length &&
        getIndent(lines[j + 1]) >= blockIndent
      ) {
        body.push(current);
        j++;
        continue;
      }
      if (getIndent(current) < blockIndent && current.trim() !== '') break;
      body.push(current);
      j++;
    }
    return { body, next: j };
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const indent = getIndent(rawLine);
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    if (line === 'doctype html') {
      result.push('<!DOCTYPE html>');
      i++;
      continue;
    }

    if (line.startsWith('style.')) {
      closeTagsToIndent(indent);
      result.push('<style>');
      stack.push({ indent, tag: 'style' });
      const { body, next } = collectBlock(i + 1, indent + 2);
      for (const bodyLine of body) result.push(bodyLine.trim());
      i = next;
      continue;
    }

    const eachMatch = line.match(/^each\s+(\w+)\s+in\s+(\w+)/);
    if (eachMatch) {
      closeTagsToIndent(indent);
      const [, itemVar, arrVar] = eachMatch;
      const arr = data[arrVar];
      if (Array.isArray(arr)) {
        const { body, next } = collectBlock(i + 1, indent + 2);
        const bodyTemplate = body.join('\n');
        for (const item of arr) {
          result.push(renderPug(bodyTemplate, { ...data, [itemVar]: item }));
        }
        i = next;
      } else {
        i++;
      }
      continue;
    }

    closeTagsToIndent(indent);

    const tagMatch = line.match(
      /^([a-zA-Z][a-zA-Z0-9]*)?([.#][^(\s]*)?(\([^)]*\))?\s*(.*)?$/,
    );

    if (tagMatch) {
      const tag = tagMatch[1] || 'div';
      const classIdStr = tagMatch[2] || '';
      const attrStr = tagMatch[3] || '';
      let text = tagMatch[4] || '';

      const classes: string[] = [];
      let id = '';
      for (const part of classIdStr.split(/(?=[.#])/)) {
        if (part.startsWith('.')) classes.push(part.slice(1));
        if (part.startsWith('#')) id = part.slice(1);
      }

      let attrs = '';
      if (attrStr) {
        attrs += ` ${attrStr.slice(1, -1).replace(/(\w+)=["']([^"']*)["']/g, '$1="$2"')}`;
      }
      if (id) attrs += ` id="${id}"`;
      if (classes.length) attrs += ` class="${classes.join(' ')}"`;

      text = text.replace(
        /#\[(\w+)\s+([^\]]+)\]/g,
        (_, inlineTag: string, inlineContent: string) =>
          `<${inlineTag}>${interpolate(inlineContent)}</${inlineTag}>`,
      );
      text = interpolate(text);

      result.push(`<${tag}${attrs}>${text}`);

      if (text && !line.includes('#[')) {
        result.push(`</${tag}>`);
      } else {
        stack.push({ indent, tag });
      }
    }

    i++;
  }

  closeTagsToIndent(-1);
  return result.join('\n');
}
