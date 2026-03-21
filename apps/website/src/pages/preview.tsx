import { useState, useCallback, useEffect, useRef } from 'react';
import Layout from '@theme/Layout';
import { Highlight, themes } from 'prism-react-renderer';
import * as Handlebars from 'handlebars';
import styles from './preview.module.css';

type Adapter = 'handlebars' | 'ejs' | 'pug';

interface AdapterInfo {
  label: string;
  defaultTemplate: string;
}

const defaultContext = JSON.stringify(
  {
    name: 'John Doe',
    email: 'john@example.com',
    code: 'ABC123',
    items: [
      { name: 'Plan Pro', price: '$9.99' },
      { name: 'Extra Storage', price: '$4.99' },
    ],
  },
  null,
  2,
);

const emailStyles = `
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
    .header { background: #e0234e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; }
    .content { padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .code { background: #f5f5f5; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 24px; text-align: center; letter-spacing: 4px; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #eee; text-align: left; }
    th { background: #f9f9f9; font-weight: 600; }
    .btn { display: inline-block; background: #e0234e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 12px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; }`;

const adapters: Record<Adapter, AdapterInfo> = {
  handlebars: {
    label: 'Handlebars',
    defaultTemplate: `<!DOCTYPE html>
<html>
<head><style>${emailStyles}</style></head>
<body>
  <div class="header">
    <h1>Welcome, {{name}}!</h1>
  </div>
  <div class="content">
    <p>Hello <strong>{{name}}</strong>,</p>
    <p>Your account (<em>{{email}}</em>) has been created.</p>
    <p>Your verification code:</p>
    <div class="code">{{code}}</div>
    <h3>Your Plan</h3>
    <table>
      <thead><tr><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        {{#each items}}
        <tr><td>{{this.name}}</td><td>{{this.price}}</td></tr>
        {{/each}}
      </tbody>
    </table>
    <a href="#" class="btn">Get Started</a>
    <p>Thanks for joining us!</p>
  </div>
  <div class="footer">
    <p>&copy; 2025 NestJS Mailer. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  ejs: {
    label: 'EJS',
    defaultTemplate: `<!DOCTYPE html>
<html>
<head><style>${emailStyles}</style></head>
<body>
  <div class="header">
    <h1>Welcome, <%= name %>!</h1>
  </div>
  <div class="content">
    <p>Hello <strong><%= name %></strong>,</p>
    <p>Your account (<em><%= email %></em>) has been created.</p>
    <p>Your verification code:</p>
    <div class="code"><%= code %></div>
    <h3>Your Plan</h3>
    <table>
      <thead><tr><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        <% items.forEach(function(item) { %>
        <tr><td><%= item.name %></td><td><%= item.price %></td></tr>
        <% }); %>
      </tbody>
    </table>
    <a href="#" class="btn">Get Started</a>
    <p>Thanks for joining us!</p>
  </div>
  <div class="footer">
    <p>&copy; 2025 NestJS Mailer. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  pug: {
    label: 'Pug',
    defaultTemplate: `doctype html
html
  head
    style.
      ${emailStyles.split('\n').join('\n      ')}
  body
    .header
      h1 Welcome, #{name}!
    .content
      p Hello #[strong #{name}],
      p Your account (#[em #{email}]) has been created.
      p Your verification code:
      .code #{code}
      h3 Your Plan
      table
        thead
          tr
            th Item
            th Price
        tbody
          each item in items
            tr
              td #{item.name}
              td #{item.price}
      a.btn(href="#") Get Started
      p Thanks for joining us!
    .footer
      p &copy; 2025 NestJS Mailer. All rights reserved.`,
  },
};

// Lightweight EJS renderer (browser-compatible)
function renderEjs(template: string, data: Record<string, unknown>): string {
  // Build a function body from the EJS template
  let fnBody = "let __output = '';\n";

  // Make all data keys available as local variables
  for (const key of Object.keys(data)) {
    fnBody += `const ${key} = __data["${key}"];\n`;
  }

  let cursor = 0;
  const re = /<%([=-]?)([\s\S]*?)%>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(template)) !== null) {
    // Add literal text before this tag
    const text = template.slice(cursor, match.index);
    if (text) {
      fnBody += `__output += ${JSON.stringify(text)};\n`;
    }
    cursor = match.index + match[0].length;

    const flag = match[1];
    const code = match[2].trim();

    if (flag === '=' || flag === '-') {
      // Output expression
      fnBody += `__output += String(${code});\n`;
    } else {
      // Executable code
      fnBody += code + '\n';
    }
  }

  // Add remaining text
  if (cursor < template.length) {
    fnBody += `__output += ${JSON.stringify(template.slice(cursor))};\n`;
  }

  fnBody += 'return __output;';

  const fn = new Function('__data', fnBody);
  return fn(data);
}

// Lightweight Pug renderer (browser-compatible, supports common features)
function renderPug(template: string, data: Record<string, unknown>): string {
  const lines = template.split('\n');
  const result: string[] = [];
  const stack: { indent: number; tag: string }[] = [];

  function getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].replace(/\t/g, '  ').length : 0;
  }

  function interpolate(text: string): string {
    // Handle #{var} interpolation
    return text.replace(/#\{([^}]+)\}/g, (_, expr) => {
      try {
        const fn = new Function(...Object.keys(data), `return ${expr}`);
        return String(fn(...Object.values(data)));
      } catch {
        return '';
      }
    });
  }

  function closeTagsToIndent(indent: number) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      const item = stack.pop();
      if (item && !['img', 'br', 'hr', 'input', 'meta', 'link'].includes(item.tag)) {
        result.push(`</${item.tag}>`);
      }
    }
  }

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const indent = getIndent(rawLine);
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    // Handle doctype
    if (line === 'doctype html') {
      result.push('<!DOCTYPE html>');
      i++;
      continue;
    }

    // Handle style. (inline block)
    if (line === 'style.' || line.startsWith('style.')) {
      closeTagsToIndent(indent);
      result.push('<style>');
      stack.push({ indent, tag: 'style' });
      i++;
      const blockIndent = i < lines.length ? getIndent(lines[i]) : indent + 2;
      while (i < lines.length) {
        const bLine = lines[i];
        const bIndent = getIndent(bLine);
        if (bLine.trim() === '' && i + 1 < lines.length && getIndent(lines[i + 1]) >= blockIndent) {
          result.push('');
          i++;
          continue;
        }
        if (bIndent < blockIndent && bLine.trim() !== '') break;
        result.push(bLine.trim());
        i++;
      }
      continue;
    }

    // Handle each loops
    const eachMatch = line.match(/^each\s+(\w+)\s+in\s+(\w+)/);
    if (eachMatch) {
      closeTagsToIndent(indent);
      const itemVar = eachMatch[1];
      const arrVar = eachMatch[2];
      const arr = data[arrVar] as unknown[];
      if (Array.isArray(arr)) {
        // Collect loop body lines
        const bodyLines: string[] = [];
        const bodyIndent = i + 1 < lines.length ? getIndent(lines[i + 1]) : indent + 2;
        let j = i + 1;
        while (j < lines.length) {
          const jIndent = getIndent(lines[j]);
          if (lines[j].trim() === '' && j + 1 < lines.length && getIndent(lines[j + 1]) >= bodyIndent) {
            bodyLines.push(lines[j]);
            j++;
            continue;
          }
          if (jIndent < bodyIndent && lines[j].trim() !== '') break;
          bodyLines.push(lines[j]);
          j++;
        }
        // Render loop body for each item
        for (const item of arr) {
          const loopData = { ...data, [itemVar]: item };
          const bodyTemplate = bodyLines.join('\n');
          result.push(renderPug(bodyTemplate, loopData));
        }
        i = j;
      } else {
        i++;
      }
      continue;
    }

    closeTagsToIndent(indent);

    // Parse tag line: tag.class1.class2(attrs) text
    const tagMatch = line.match(
      /^([a-zA-Z][a-zA-Z0-9]*)?([.#][^(\s]*)?(\([^)]*\))?\s*(.*)?$/,
    );

    if (tagMatch) {
      let tag = tagMatch[1] || 'div';
      const classIdStr = tagMatch[2] || '';
      const attrStr = tagMatch[3] || '';
      let text = tagMatch[4] || '';

      // Parse classes and ids from .class#id syntax
      const classes: string[] = [];
      let id = '';
      const parts = classIdStr.split(/(?=[.#])/);
      for (const part of parts) {
        if (part.startsWith('.')) classes.push(part.slice(1));
        if (part.startsWith('#')) id = part.slice(1);
      }

      // Parse attributes
      let attrs = '';
      if (attrStr) {
        attrs += ' ' + attrStr.slice(1, -1).replace(/(\w+)=["']([^"']*)["']/g, '$1="$2"');
      }
      if (id) attrs += ` id="${id}"`;
      if (classes.length) attrs += ` class="${classes.join(' ')}"`;

      // Handle #[inline tags]
      text = text.replace(/#\[(\w+)\s+([^\]]+)\]/g, (_, inlineTag, inlineContent) => {
        return `<${inlineTag}>${interpolate(inlineContent)}</${inlineTag}>`;
      });

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

function compileTemplate(
  adapter: Adapter,
  template: string,
  context: Record<string, unknown>,
): string {
  switch (adapter) {
    case 'handlebars': {
      const compiled = Handlebars.compile(template);
      return compiled(context);
    }
    case 'ejs':
      return renderEjs(template, context);
    case 'pug':
      return renderPug(template, context);
    default:
      throw new Error(`Unknown adapter: ${adapter}`);
  }
}

const adapterToLanguage: Record<Adapter, string> = {
  handlebars: 'handlebars',
  ejs: 'markup',
  pug: 'pug',
};

function HighlightedEditor({
  value,
  onChange,
  language,
}: {
  value: string;
  onChange: (val: string) => void;
  language: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  return (
    <div className={styles.editorWrapper}>
      <Highlight theme={themes.dracula} code={value} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre ref={preRef} className={styles.editorHighlight}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <textarea
        ref={textareaRef}
        className={styles.editorTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
      />
    </div>
  );
}

export default function Preview(): JSX.Element {
  const [adapter, setAdapter] = useState<Adapter>('handlebars');
  const [template, setTemplate] = useState(adapters.handlebars.defaultTemplate);
  const [contextStr, setContextStr] = useState(defaultContext);
  const [showContext, setShowContext] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState('');
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const renderTemplate = useCallback(() => {
    try {
      const ctx = JSON.parse(contextStr);
      const html = compileTemplate(adapter, template, ctx);
      setRenderedHtml(html);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRenderedHtml('');
    }
  }, [adapter, template, contextStr]);

  useEffect(() => {
    const timeout = setTimeout(renderTemplate, 300);
    return () => clearTimeout(timeout);
  }, [renderTemplate]);

  useEffect(() => {
    if (iframeRef.current && renderedHtml) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(renderedHtml);
        doc.close();
      }
    }
  }, [renderedHtml]);

  const handleAdapterChange = (newAdapter: Adapter) => {
    setAdapter(newAdapter);
    setTemplate(adapters[newAdapter].defaultTemplate);
  };

  return (
    <Layout title="Template Preview" description="Preview email templates with different adapters">
      <div className={styles.previewContainer}>
        <div className={styles.toolbar}>
          <select
            className={styles.adapterSelect}
            value={adapter}
            onChange={(e) => handleAdapterChange(e.target.value as Adapter)}
          >
            {Object.entries(adapters).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            className={showContext ? styles.contextToggleActive : styles.contextToggle}
            onClick={() => setShowContext(!showContext)}
            type="button"
          >
            {showContext ? 'Hide' : 'Show'} Context (JSON)
          </button>
        </div>

        <div className={styles.panels}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Template</span>
              <span className={styles.badge}>{adapters[adapter].label}</span>
            </div>
            <HighlightedEditor
              value={template}
              onChange={setTemplate}
              language={adapterToLanguage[adapter]}
            />
            {showContext && (
              <textarea
                className={styles.contextEditor}
                value={contextStr}
                onChange={(e) => setContextStr(e.target.value)}
                spellCheck={false}
                placeholder="Template context (JSON)"
              />
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span>Preview</span>
            </div>
            {error ? (
              <div className={styles.error}>{error}</div>
            ) : (
              <iframe
                ref={iframeRef}
                className={styles.previewIframe}
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
