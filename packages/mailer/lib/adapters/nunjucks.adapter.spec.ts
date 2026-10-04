import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { NunjucksAdapter } from './nunjucks.adapter';

const templateDir = path.join(__dirname, '..', 'test-templates');

function createMail(template: string, context: any = {}) {
  return { data: { template, context, html: undefined as string | undefined } };
}

function compileAsync(
  adapter: NunjucksAdapter,
  mail: any,
  options: MailerOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    adapter.compile(
      mail,
      (err?: any) => {
        if (err) return reject(err);
        resolve(mail.data.html);
      },
      options,
    );
  });
}

describe('NunjucksAdapter', () => {
  const baseOptions: MailerOptions = {
    transport: { host: 'localhost', port: 25 },
    template: { dir: templateDir },
  };

  it('should compile a nunjucks template with context', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail('nunjucks-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Nunjucks test template. by TestMailer</p>\n');
  });

  it('should inline CSS by default', async () => {
    const adapter = new NunjucksAdapter();
    const mail = createMail('nunjucks-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('<html>');
    expect(html).toContain('<p>Nunjucks test template. by TestMailer</p>');
  });

  it('should accept a template name with an explicit extension', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail('nunjucks-template.njk', { MAILER: 'WithExt' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Nunjucks test template. by WithExt</p>\n');
  });

  it('should cache compiled templates per template name', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-njk-cache-'));
    try {
      const file = path.join(tmpDir, 'cached.njk');
      fs.writeFileSync(file, '<p>Original {{ name }}</p>');
      const options: MailerOptions = {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      };
      const adapter = new NunjucksAdapter({ inlineCssEnabled: false });

      const first = await compileAsync(
        adapter,
        createMail('cached', { name: 'First' }),
        options,
      );
      // Changes on disk are ignored once the template has been compiled
      fs.writeFileSync(file, '<p>Changed {{ name }}</p>');
      const second = await compileAsync(
        adapter,
        createMail('cached', { name: 'Second' }),
        options,
      );

      expect(first).toBe('<p>Original First</p>');
      expect(second).toBe('<p>Original Second</p>');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should resolve absolute paths without any template options', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail(path.join(templateDir, 'nunjucks-template'), {
      MAILER: 'AbsPath',
    });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
    });

    expect(html).toBe('<p>Nunjucks test template. by AbsPath</p>\n');
  });

  it('should extend layouts located in the template directory', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail('nunjucks-child', { MAILER: 'Layout' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe(
      '<main class="layout"><p>Child of layout. by Layout</p></main>\n',
    );
  });

  it('should autoescape context values by default', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail('nunjucks-template', { MAILER: '<b>bold</b>' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe(
      '<p>Nunjucks test template. by &lt;b&gt;bold&lt;/b&gt;</p>\n',
    );
  });

  it('should pass template.options to the nunjucks environment', async () => {
    const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
    const mail = createMail('nunjucks-template', { MAILER: '<b>bold</b>' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: templateDir, options: { autoescape: false } },
    });

    expect(html).toBe('<p>Nunjucks test template. by <b>bold</b></p>\n');
  });

  it('should return error for non-existent template', async () => {
    const adapter = new NunjucksAdapter();
    const mail = createMail('non-existent');

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow(
      /ENOENT/,
    );
    expect(mail.data.html).toBeUndefined();
  });

  describe('CSS inlining', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-njk-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should inline <style> rules into elements', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'styled.njk'),
        '<style>p { color: red; }</style><p>{{ text }}</p>',
      );
      const adapter = new NunjucksAdapter();
      const mail = createMail('styled', { text: 'Styled' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toContain('<p style="color: red;">Styled</p>');
    });

    it('should leave <style> blocks untouched when inlining is disabled', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'styled.njk'),
        '<style>p { color: red; }</style><p>{{ text }}</p>',
      );
      const adapter = new NunjucksAdapter({ inlineCssEnabled: false });
      const mail = createMail('styled', { text: 'Styled' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<style>p { color: red; }</style><p>Styled</p>');
    });

    it('should report CSS inlining errors through the callback exactly once', async () => {
      const adapter = new NunjucksAdapter({
        inlineCssOptions: { baseUrl: 'not a url' },
      });
      const mail = createMail('nunjucks-template', { MAILER: 'Broken' });
      const callback = jest.fn();

      adapter.compile(mail, callback, baseOptions);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({
        message: expect.stringMatching(/relative URL without a base/),
      });
      expect(mail.data.html).toBeUndefined();
    });
  });

  describe('when nunjucks is not installed', () => {
    afterEach(() => {
      jest.dontMock('nunjucks');
    });

    it('should report a helpful error through the callback', async () => {
      let Isolated!: typeof NunjucksAdapter;
      jest.isolateModules(() => {
        jest.doMock('nunjucks', () => {
          throw new Error("Cannot find module 'nunjucks'");
        });
        ({ NunjucksAdapter: Isolated } =
          jest.requireActual<typeof import('./nunjucks.adapter')>(
            './nunjucks.adapter',
          ));
      });

      const adapter = new Isolated();
      const mail = createMail('nunjucks-template', { MAILER: 'Missing' });

      await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow(
        'nunjucks is not installed. Install it with: npm install nunjucks',
      );
      expect(mail.data.html).toBeUndefined();
    });
  });

  describe('error handling', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-njk-errors-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should pass render errors to the callback', async () => {
      fs.writeFileSync(path.join(tmpDir, 'broken.njk'), '{{ missing() }}');
      const adapter = new NunjucksAdapter({ inlineCssEnabled: false });

      await expect(
        compileAsync(adapter, createMail('broken'), {
          ...baseOptions,
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow(/Unable to call `missing`/);
    });
  });
});
