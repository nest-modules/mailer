import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { LiquidAdapter } from './liquid.adapter';

const templateDir = path.join(__dirname, '..', 'test-templates');

function createMail(template: string, context: any = {}) {
  return { data: { template, context, html: undefined as string | undefined } };
}

function compileAsync(
  adapter: LiquidAdapter,
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

describe('LiquidAdapter', () => {
  const baseOptions: MailerOptions = {
    transport: { host: 'localhost', port: 25 },
    template: { dir: templateDir },
  };

  it('should compile a liquid template with context', async () => {
    const adapter = new LiquidAdapter();
    const mail = createMail('liquid-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Liquid test template. by TestMailer');
  });

  it('should handle absolute template paths', async () => {
    const adapter = new LiquidAdapter();
    const absPath = path.join(templateDir, 'liquid-template');
    const mail = createMail(absPath, { MAILER: 'AbsPath' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: '' },
    });

    expect(html).toContain('AbsPath');
  });

  it('should return error for non-existent template', async () => {
    const adapter = new LiquidAdapter();
    const mail = createMail('non-existent', {});

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow();
  });

  it('should accept custom liquid config', async () => {
    const adapter = new LiquidAdapter({ globals: {} });
    const mail = createMail('liquid-template', { MAILER: 'Custom' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Custom');
  });

  it('should handle empty config gracefully', async () => {
    const adapter = new LiquidAdapter();
    const mail = createMail('liquid-template', { MAILER: 'NoConfig' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('NoConfig');
  });

  it('should accept a template name with an explicit extension', async () => {
    const adapter = new LiquidAdapter();
    const mail = createMail('liquid-template.liquid', { MAILER: 'WithExt' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Liquid test template. by WithExt</p>\n');
  });

  it('should resolve relative paths against the working directory without template options', async () => {
    const adapter = new LiquidAdapter();
    const relativePath = path.relative(
      process.cwd(),
      path.join(templateDir, 'liquid-template'),
    );
    const mail = createMail(relativePath, { MAILER: 'Relative' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
    });

    expect(html).toBe('<p>Liquid test template. by Relative</p>\n');
  });

  describe('with templates on disk', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-liquid-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should render partials located next to the template', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'greeting.liquid'),
        '<strong>{{ name }}</strong>',
      );
      fs.writeFileSync(
        path.join(tmpDir, 'main.liquid'),
        '<p>Hi {% render "greeting", name: name %}</p>',
      );
      const adapter = new LiquidAdapter();
      const mail = createMail('main', { name: 'Grace' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<p>Hi <strong>Grace</strong></p>');
    });

    it('should report template syntax errors through the callback', async () => {
      fs.writeFileSync(path.join(tmpDir, 'broken.liquid'), '{% if %}');
      const adapter = new LiquidAdapter();
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

  describe('engine options', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-liquid-opts-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should expose configured globals to templates', async () => {
      fs.writeFileSync(path.join(tmpDir, 'global.liquid'), '{{ company }}');
      const adapter = new LiquidAdapter({ globals: { company: 'ACME' } });

      const html = await compileAsync(adapter, createMail('global'), {
        ...baseOptions,
        template: { dir: tmpDir },
      });

      expect(html).toBe('ACME');
    });

    it('should honour engine options such as strictVariables', async () => {
      fs.writeFileSync(path.join(tmpDir, 'strict.liquid'), '{{ missing }}');
      const adapter = new LiquidAdapter({ strictVariables: true });

      await expect(
        compileAsync(adapter, createMail('strict'), {
          ...baseOptions,
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow(/undefined variable: missing/);
    });
  });
});
