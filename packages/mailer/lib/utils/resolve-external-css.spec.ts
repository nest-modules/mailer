import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveExternalCss } from './resolve-external-css';

describe('resolveExternalCss', () => {
  let root: string;
  let baseDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-css-'));
    baseDir = path.join(root, 'templates');
    fs.mkdirSync(path.join(baseDir, 'css'), { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'css', 'main.css'), 'p{color:red}');
    fs.writeFileSync(path.join(baseDir, 'secret.env'), 'TOKEN=1');
    fs.writeFileSync(path.join(root, 'outside.css'), 'body{}');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('should inline a local stylesheet inside the base directory', () => {
    expect(
      resolveExternalCss(
        '<p>x</p><link rel="stylesheet" href="css/main.css" />',
        baseDir,
      ),
    ).toBe('<p>x</p><style>p{color:red}</style>');
  });

  it('should accept href before rel and single quotes', () => {
    expect(
      resolveExternalCss(
        "<link href='css/main.css' type='text/css' rel='stylesheet'>",
        baseDir,
      ),
    ).toBe('<style>p{color:red}</style>');
  });

  it.each([
    ['a relative path escaping the base directory', '../outside.css'],
    ['an absolute path outside the base directory', 'ABSOLUTE_OUTSIDE'],
    ['a non-css file inside the base directory', 'secret.env'],
    ['a missing file', 'css/missing.css'],
    ['an http URL', 'http://example.com/a.css'],
    ['an https URL', 'https://example.com/a.css'],
    ['a protocol-relative URL', '//example.com/a.css'],
  ])('should keep the tag for %s', (_, href) => {
    const target =
      href === 'ABSOLUTE_OUTSIDE' ? path.join(root, 'outside.css') : href;
    const html = `<link rel="stylesheet" href="${target}">`;

    expect(resolveExternalCss(html, baseDir)).toBe(html);
  });

  it('should keep links that are not stylesheets or have no href', () => {
    const html = '<link rel="icon" href="css/main.css"><link rel="stylesheet">';

    expect(resolveExternalCss(html, baseDir)).toBe(html);
  });

  it('should return the html untouched without a base directory', () => {
    const html = '<link rel="stylesheet" href="css/main.css">';

    expect(resolveExternalCss(html, '')).toBe(html);
  });

  it('should process large adversarial input in linear time', () => {
    const html = '<link rel="stylesheet" '.repeat(20_000);
    const start = Date.now();

    expect(resolveExternalCss(html, baseDir)).toBe(html);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
