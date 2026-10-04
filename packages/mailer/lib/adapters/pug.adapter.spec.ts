import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { PugAdapter } from './pug.adapter';

const templateDir = path.join(__dirname, '..', 'test-templates');

function createMail(template: string, context: any = {}) {
  return { data: { template, context, html: undefined as string | undefined } };
}

function compileAsync(
  adapter: PugAdapter,
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

describe('PugAdapter', () => {
  const baseOptions: MailerOptions = {
    transport: { host: 'localhost', port: 25 },
    template: { dir: templateDir },
  };

  it('should compile a pug template with context', async () => {
    const adapter = new PugAdapter();
    const mail = createMail('pug-template', { world: 'World' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Pug test template.');
    expect(html).toContain('Hello World!');
  });

  it('should inline CSS by default', async () => {
    const adapter = new PugAdapter();
    const mail = createMail('pug-template', { world: 'World' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('<html>');
  });

  it('should not inline CSS when disabled', async () => {
    const adapter = new PugAdapter({ inlineCssEnabled: false });
    const mail = createMail('pug-template', { world: 'World' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Pug test template.</p><p>Hello World!</p>');
  });

  it('should handle absolute template paths', async () => {
    const adapter = new PugAdapter({ inlineCssEnabled: false });
    const absPath = path.join(templateDir, 'pug-template');
    const mail = createMail(absPath, { world: 'AbsWorld' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: '' },
    });

    expect(html).toContain('AbsWorld');
  });

  it('should return error for non-existent template', async () => {
    const adapter = new PugAdapter();
    const mail = createMail('non-existent', {});

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow();
  });

  it('should merge template options with context', async () => {
    const adapter = new PugAdapter({ inlineCssEnabled: false });
    const mail = createMail('pug-template', { world: 'Merged' });

    const html = await compileAsync(adapter, mail, {
      ...baseOptions,
      template: { dir: templateDir, options: { cache: false } },
    });

    expect(html).toContain('Merged');
  });

  it('should accept a template name with an explicit extension', async () => {
    const adapter = new PugAdapter({ inlineCssEnabled: false });
    const mail = createMail('pug-template.pug', { world: 'Ext' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Pug test template.</p><p>Hello Ext!</p>');
  });

  it('should resolve relative paths against the working directory without template options', async () => {
    const adapter = new PugAdapter({ inlineCssEnabled: false });
    const relativePath = path.relative(
      process.cwd(),
      path.join(templateDir, 'pug-template'),
    );
    const mail = createMail(relativePath, { world: 'Relative' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
    });

    expect(html).toBe('<p>Pug test template.</p><p>Hello Relative!</p>');
  });

  describe('with templates on disk', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-pug-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should pass template.options (e.g. basedir) to pug', async () => {
      fs.mkdirSync(path.join(tmpDir, 'shared'));
      fs.mkdirSync(path.join(tmpDir, 'emails'));
      fs.writeFileSync(path.join(tmpDir, 'shared', 'footer.pug'), 'footer Bye');
      fs.writeFileSync(
        path.join(tmpDir, 'emails', 'main.pug'),
        'p= greeting\ninclude /shared/footer.pug\n',
      );
      const adapter = new PugAdapter({ inlineCssEnabled: false });
      const mail = createMail('main', { greeting: 'Hi' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: {
          dir: path.join(tmpDir, 'emails'),
          options: { basedir: tmpDir },
        },
      });

      expect(html).toBe('<p>Hi</p><footer>Bye</footer>');
    });

    it('should not let context values act as compiler options', async () => {
      fs.mkdirSync(path.join(tmpDir, 'shared'));
      fs.writeFileSync(path.join(tmpDir, 'shared', 'secret.pug'), 'p Secret');
      fs.writeFileSync(
        path.join(tmpDir, 'main.pug'),
        'p= greeting\ninclude /shared/secret.pug\n',
      );
      const adapter = new PugAdapter({ inlineCssEnabled: false });
      const mail = createMail('main', { greeting: 'Hi', basedir: tmpDir });

      await expect(
        compileAsync(adapter, mail, {
          transport: { host: 'localhost', port: 25 },
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow(/basedir/);
      expect(mail.data.html).toBeUndefined();
    });

    it('should expose template.options as locals, overriding the context', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'brand.pug'),
        'p= brand + " " + who\n',
      );
      const adapter = new PugAdapter({ inlineCssEnabled: false });
      const mail = createMail('brand', { brand: 'ctx', who: 'Ana' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir, options: { brand: 'Acme' } },
      });

      expect(html).toBe('<p>Acme Ana</p>');
    });

    it('should inline <style> rules into elements', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'styled.pug'),
        'style p { color: red; }\np Styled\n',
      );
      const adapter = new PugAdapter();
      const mail = createMail('styled');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toContain('<p style="color: red;">Styled</p>');
    });
  });

  it('should report CSS inlining errors through the callback', async () => {
    const adapter = new PugAdapter({
      inlineCssOptions: { baseUrl: 'not a url' },
    });
    const mail = createMail('pug-template', { world: 'Broken' });

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow(
      /relative URL without a base/,
    );
    expect(mail.data.html).toBeUndefined();
  });

  it('should call the callback once when CSS inlining fails', (done) => {
    const adapter = new PugAdapter({
      inlineCssOptions: { baseUrl: 'not a url' },
    });
    const callback = jest.fn();

    adapter.compile(
      createMail('pug-template', { MAILER: 'Once' }),
      callback,
      baseOptions,
    );

    setImmediate(() => {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].message).toMatch(/relative URL/);
      done();
    });
  });
});
