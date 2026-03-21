import * as path from 'path';
import { LiquidAdapter } from './liquid.adapter';
import { MailerOptions } from '../interfaces/mailer-options.interface';

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
    adapter.compile(mail, (err?: any) => {
      if (err) return reject(err);
      resolve(mail.data.html);
    }, options);
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
});
