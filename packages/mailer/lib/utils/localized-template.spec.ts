import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LOCALE_PATTERN,
  localizedCandidates,
  templateExists,
} from './localized-template';

describe('localized templates', () => {
  describe('LOCALE_PATTERN', () => {
    it.each(['en', 'es-CO', 'zh_Hant_TW', 'fil'])('should accept %s', (tag) => {
      expect(LOCALE_PATTERN.test(tag)).toBe(true);
    });

    it.each(['', 'e', '../etc', 'en/../../x', 'en-'])(
      'should reject %p',
      (tag) => {
        expect(LOCALE_PATTERN.test(tag)).toBe(false);
      },
    );
  });

  describe('localizedCandidates', () => {
    it('should try the locale, then its language, in both layouts', () => {
      expect(localizedCandidates('welcome', 'es-CO')).toEqual([
        path.join('es-CO', 'welcome'),
        'welcome.es-CO',
        path.join('es', 'welcome'),
        'welcome.es',
      ]);
    });

    it('should not repeat a locale without a region', () => {
      expect(localizedCandidates('welcome', 'fr')).toEqual([
        path.join('fr', 'welcome'),
        'welcome.fr',
      ]);
    });

    it('should ignore an invalid locale', () => {
      expect(localizedCandidates('welcome', '../../etc')).toEqual([]);
    });
  });

  describe('templateExists', () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-locales-'));
      fs.mkdirSync(path.join(dir, 'es'));
      fs.writeFileSync(path.join(dir, 'es', 'welcome.hbs'), '');
      fs.writeFileSync(path.join(dir, 'welcome.fr.mjml'), '');
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should find a template with any known extension', () => {
      expect(templateExists([dir], path.join('es', 'welcome'))).toBe(true);
      expect(templateExists([dir], 'welcome.fr')).toBe(true);
    });

    it('should search every directory', () => {
      expect(templateExists(['/nonexistent', dir], 'welcome.fr')).toBe(true);
    });

    it('should report a missing template', () => {
      expect(templateExists([dir], 'missing')).toBe(false);
      expect(templateExists([], 'welcome.fr')).toBe(false);
    });
  });
});
