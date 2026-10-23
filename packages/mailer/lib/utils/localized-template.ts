import * as fs from 'node:fs';
import * as path from 'node:path';

/** BCP 47-like language tags such as `en`, `es-CO`, `zh_Hant_TW` */
export const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;

/** The extensions the bundled adapters read */
export const TEMPLATE_EXTENSIONS = [
  '.hbs',
  '.pug',
  '.ejs',
  '.njk',
  '.liquid',
  '.mjml',
  '.html',
];

/** Whether `name` exists in one of `dirs`, with any template extension */
export function templateExists(dirs: string[], name: string): boolean {
  return dirs.some((dir) => {
    const base = path.join(dir, name);
    return TEMPLATE_EXTENSIONS.some((ext) => fs.existsSync(base + ext));
  });
}

/**
 * The template names to try for `locale`, most specific first. Both layouts are
 * supported: a folder per locale (`es-CO/welcome`, this library's convention)
 * and a suffix (`welcome.es-CO`, the `@nestjs/mail` convention). A region falls
 * back to its language (`es-CO` → `es`).
 */
export function localizedCandidates(name: string, locale: string): string[] {
  if (!LOCALE_PATTERN.test(locale)) return [];
  const locales = [locale];
  const language = locale.split(/[-_]/)[0];
  if (language !== locale) locales.push(language);
  return locales.flatMap((l) => [path.join(l, name), `${name}.${l}`]);
}
