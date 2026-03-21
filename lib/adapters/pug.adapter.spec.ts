import * as path from 'path';
import { PugAdapter } from './pug.adapter';
import { MailerOptions } from '../interfaces/mailer-options.interface';

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
    adapter.compile(mail, (err?: any) => {
      if (err) return reject(err);
      resolve(mail.data.html);
    }, options);
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
});
