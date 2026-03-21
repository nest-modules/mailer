import * as path from 'path';
import { EjsAdapter } from './ejs.adapter';
import { MailerOptions } from '../interfaces/mailer-options.interface';

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
    adapter.compile(mail, (err?: any) => {
      if (err) return reject(err);
      resolve(mail.data.html);
    }, options);
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
});
