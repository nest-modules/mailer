import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { EjsAdapter } from './ejs.adapter';

const templateDir = path.join(__dirname, '..', 'test-templates');

function createMail(template: string, context: any = {}) {
  return { data: { template, context, html: undefined as string | undefined } };
}

function compileAsync(
  adapter: EjsAdapter,
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

describe('EjsAdapter', () => {
  const baseOptions: MailerOptions = {
    transport: { host: 'localhost', port: 25 },
    template: { dir: templateDir },
  };

  it('should compile an ejs template with context', async () => {
    const adapter = new EjsAdapter();
    const mail = createMail('ejs-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Ejs test template. by TestMailer');
  });

  it('should inline CSS by default', async () => {
    const adapter = new EjsAdapter();
    const mail = createMail('ejs-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('<html>');
  });

  it('should not inline CSS when disabled', async () => {
    const adapter = new EjsAdapter({ inlineCssEnabled: false });
    const mail = createMail('ejs-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Ejs test template. by TestMailer');
    expect(html).not.toContain('<html>');
  });

  it('should cache compiled templates', async () => {
    const adapter = new EjsAdapter({ inlineCssEnabled: false });
    const mail1 = createMail('ejs-template', { MAILER: 'First' });
    const mail2 = createMail('ejs-template', { MAILER: 'Second' });

    await compileAsync(adapter, mail1, baseOptions);
    await compileAsync(adapter, mail2, baseOptions);

    expect(mail1.data.html).toContain('First');
    expect(mail2.data.html).toContain('Second');
  });

  it('should handle absolute template paths', async () => {
    const adapter = new EjsAdapter({ inlineCssEnabled: false });
    const absPath = path.join(templateDir, 'ejs-template');
    const mail = createMail(absPath, { MAILER: 'AbsPath' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: '' },
    });

    expect(html).toContain('AbsPath');
  });

  it('should return error for non-existent template', async () => {
    const adapter = new EjsAdapter();
    const mail = createMail('non-existent', {});

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow();
  });

  it('should accept custom ejs options via mailerOptions', async () => {
    const adapter = new EjsAdapter({ inlineCssEnabled: false });
    const mail = createMail('ejs-template', { MAILER: 'WithOptions' });

    const html = await compileAsync(adapter, mail, {
      ...baseOptions,
      template: { dir: templateDir, options: {} },
    });

    expect(html).toContain('WithOptions');
  });

  describe('template resolution', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-ejs-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should accept a template name with an explicit extension', async () => {
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('ejs-template.ejs', { MAILER: 'WithExt' });

      const html = await compileAsync(adapter, mail, baseOptions);

      expect(html).toBe('<p>Ejs test template. by WithExt</p>');
    });

    it('should resolve absolute paths without any template options', async () => {
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail(path.join(templateDir, 'ejs-template'), {
        MAILER: 'NoTemplateOptions',
      });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
      });

      expect(html).toBe('<p>Ejs test template. by NoTemplateOptions</p>');
    });

    it('should report a missing absolute template when no template options exist', async () => {
      const adapter = new EjsAdapter();
      const mail = createMail(path.join(tmpDir, 'missing'));

      await expect(
        compileAsync(adapter, mail, {
          transport: { host: 'localhost', port: 25 },
        }),
      ).rejects.toThrow(/ENOENT/);
    });

    it('should look up the template in additional template.dirs', async () => {
      const firstDir = path.join(tmpDir, 'first');
      const secondDir = path.join(tmpDir, 'second');
      fs.mkdirSync(firstDir);
      fs.mkdirSync(secondDir);
      fs.writeFileSync(
        path.join(secondDir, 'extra.ejs'),
        '<p>From second dir: <%= name %></p>',
      );

      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('extra', { name: 'Ada' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, dirs: [firstDir, secondDir] },
      });

      expect(html).toBe('<p>From second dir: Ada</p>');
    });

    it('should prefer template.dir over template.dirs when the template exists', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'ejs-template.ejs'),
        '<p>Shadowed template</p>',
      );

      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('ejs-template', { MAILER: 'Primary' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, dirs: [tmpDir] },
      });

      expect(html).toBe('<p>Ejs test template. by Primary</p>');
    });

    it('should report an error when the template is in none of the template.dirs', async () => {
      const adapter = new EjsAdapter();
      const mail = createMail('nowhere');

      await expect(
        compileAsync(adapter, mail, {
          transport: { host: 'localhost', port: 25 },
          template: { dir: templateDir, dirs: [tmpDir] },
        }),
      ).rejects.toThrow(/ENOENT/);
    });

    it('should resolve includes relative to the template file', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'greeting.ejs'),
        '<strong><%= name %></strong>',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'main.ejs'),
        "<p>Hi <%- include('greeting', { name }) %></p>",
      );

      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('main', { name: 'Grace' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<p>Hi <strong>Grace</strong></p>');
    });

    it('should report template syntax errors through the callback', async () => {
      fs.writeFileSync(path.join(tmpDir, 'broken.ejs'), '<p><%= </p>');

      const adapter = new EjsAdapter();
      const mail = createMail('broken');

      await expect(
        compileAsync(adapter, mail, {
          transport: { host: 'localhost', port: 25 },
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow();
      expect(mail.data.html).toBeUndefined();
    });
  });

  describe('async templates', () => {
    it('should render templates compiled with the async option', async () => {
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('ejs-template', { MAILER: 'Async' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, options: { async: true } },
      });

      expect(html).toBe('<p>Ejs test template. by Async</p>');
    });
  });

  describe('CSS handling', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-ejs-css-'));
      fs.writeFileSync(path.join(tmpDir, 'style.css'), 'p { color: red; }');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeTemplate(name: string, href: string) {
      fs.writeFileSync(
        path.join(tmpDir, `${name}.ejs`),
        `<link rel="stylesheet" href="${href}"><p>Styled</p>`,
      );
    }

    it('should inline styles declared in <style> blocks', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'styled.ejs'),
        '<style>p { color: blue; }</style><p>Styled</p>',
      );
      const adapter = new EjsAdapter();
      const mail = createMail('styled');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toContain('<p style="color: blue;">Styled</p>');
    });

    it('should replace a local stylesheet <link> with its contents and inline it', async () => {
      writeTemplate('local', 'style.css');
      const adapter = new EjsAdapter();
      const mail = createMail('local');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).not.toContain('<link');
      expect(html).toContain('<p style="color: red;">Styled</p>');
    });

    it('should embed a local stylesheet as <style> when inlining is disabled', async () => {
      writeTemplate('local', 'style.css');
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('local');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<style>p { color: red; }</style><p>Styled</p>');
    });

    it('should resolve stylesheets against cssBaseUrl when configured', async () => {
      const cssDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(cssDir);
      fs.writeFileSync(path.join(cssDir, 'theme.css'), 'p { margin: 0; }');
      writeTemplate('themed', 'theme.css');

      const adapter = new EjsAdapter({
        inlineCssEnabled: false,
        cssBaseUrl: cssDir,
      });
      const mail = createMail('themed');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<style>p { margin: 0; }</style><p>Styled</p>');
    });

    it.each([
      'http://cdn.example.com/style.css',
      'https://cdn.example.com/style.css',
      '//cdn.example.com/style.css',
    ])('should keep remote stylesheet %s untouched', async (href) => {
      writeTemplate('remote', href);
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('remote');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe(`<link rel="stylesheet" href="${href}"><p>Styled</p>`);
    });

    it('should keep the <link> tag when the local stylesheet does not exist', async () => {
      writeTemplate('missing-css', 'missing.css');
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail('missing-css');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe(
        '<link rel="stylesheet" href="missing.css"><p>Styled</p>',
      );
    });

    it('should not resolve stylesheets when there is no base directory', async () => {
      writeTemplate('no-base', 'style.css');
      const adapter = new EjsAdapter({ inlineCssEnabled: false });
      const mail = createMail(path.join(tmpDir, 'no-base'));

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
      });

      expect(html).toBe(
        '<link rel="stylesheet" href="style.css"><p>Styled</p>',
      );
    });

    it('should report CSS inlining errors through the callback', async () => {
      const adapter = new EjsAdapter({
        inlineCssOptions: { baseUrl: 'not a url' },
      });
      const mail = createMail('ejs-template', { MAILER: 'Broken' });

      await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow(
        /relative URL without a base/,
      );
    });
  });

  describe('error handling', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-ejs-errors-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should pass render errors to the callback', async () => {
      fs.writeFileSync(path.join(tmpDir, 'broken.ejs'), '<%= missing.prop %>');
      const adapter = new EjsAdapter({ inlineCssEnabled: false });

      await expect(
        compileAsync(adapter, createMail('broken'), {
          ...baseOptions,
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow(/missing is not defined/);
    });

    it('should pass async render rejections to the callback', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'async-broken.ejs'),
        "<% await Promise.reject(new Error('async boom')) %>",
      );
      const adapter = new EjsAdapter({ inlineCssEnabled: false });

      await expect(
        compileAsync(adapter, createMail('async-broken'), {
          ...baseOptions,
          template: { dir: tmpDir, options: { async: true } },
        }),
      ).rejects.toThrow('async boom');
    });

    it('should resolve nested templates from additional dirs', async () => {
      const extra = path.join(tmpDir, 'extra');
      fs.mkdirSync(path.join(extra, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(extra, 'sub', 'nested.ejs'), '<p>nested</p>');
      const adapter = new EjsAdapter({ inlineCssEnabled: false });

      const html = await compileAsync(adapter, createMail('sub/nested'), {
        ...baseOptions,
        template: { dir: path.join(tmpDir, 'base'), dirs: [extra] },
      });

      expect(html).toBe('<p>nested</p>');
    });

    it('should call the callback once when CSS inlining fails', () => {
      const adapter = new EjsAdapter({
        inlineCssOptions: { baseUrl: 'not a url' },
      });
      const callback = jest.fn();

      adapter.compile(
        createMail('ejs-template', { MAILER: 'Once' }),
        callback,
        baseOptions,
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].message).toMatch(/relative URL/);
    });
  });
});
