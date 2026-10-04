import * as fs from 'node:fs';
import * as path from 'node:path';
import { isWithinDirectory } from './is-within-directory';

// Linear-time patterns: match each <link> tag first, then inspect it
const LINK_TAG = /<link\b[^<>]*>/gi;
const STYLESHEET_REL = /\brel\s*=\s*["']stylesheet["']/i;
const HREF = /\bhref\s*=\s*["']([^"']+)["']/i;
const REMOTE_URL = /^(?:[a-z][a-z\d+.-]*:)?\/\//i;

/**
 * Replace <link rel="stylesheet" href="..."> with inline <style> blocks when
 * the href points to a local .css file inside `baseDir`. Anything else
 * (remote URLs, other file types, paths escaping `baseDir`, missing files)
 * keeps the original tag, so rendered context values cannot read arbitrary
 * files from disk.
 */
export function resolveExternalCss(html: string, baseDir: string): string {
  if (!baseDir) return html;

  return html.replace(LINK_TAG, (tag) => {
    if (!STYLESHEET_REL.test(tag)) return tag;

    const href = HREF.exec(tag)?.[1];
    if (!href || REMOTE_URL.test(href)) return tag;

    const cssPath = path.resolve(baseDir, href);
    if (
      path.extname(cssPath).toLowerCase() !== '.css' ||
      !isWithinDirectory(baseDir, cssPath)
    ) {
      return tag;
    }

    try {
      return `<style>${fs.readFileSync(cssPath, 'utf-8')}</style>`;
    } catch {
      // File not found, keep the original <link> tag
      return tag;
    }
  });
}
