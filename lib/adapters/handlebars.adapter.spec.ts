import * as path from 'path';
import { HandlebarsAdapter } from './handlebars.adapter';
import { MailerOptions } from '../interfaces/mailer-options.interface';

const templateDir = path.join(__dirname, '..', 'test-templates');

function createMail(template: string, context: any = {}) {
  return { data: { template, context, html: undefined as string | undefined } };
}

function compileAsync(
  adapter: HandlebarsAdapter,
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

describe('HandlebarsAdapter', () => {
  const baseOptions: MailerOptions = {
    transport: { host: 'localhost', port: 25 },
    template: { dir: templateDir },
  };

  it('should compile a handlebars template with context', async () => {
    const adapter = new HandlebarsAdapter();
    const mail = createMail('handlebars-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Handlebars test template. by TestMailer');
  });

  it('should inline CSS by default', async () => {
    const adapter = new HandlebarsAdapter();
    const mail = createMail('handlebars-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    // css-inline wraps in html/head/body tags
    expect(html).toContain('<html>');
    expect(html).toContain('<body>');
  });

  it('should not inline CSS when disabled', async () => {
    const adapter = new HandlebarsAdapter(undefined, { inlineCssEnabled: false });
    const mail = createMail('handlebars-template', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('Handlebars test template. by TestMailer');
    expect(html).not.toContain('<html>');
  });

  it('should handle media queries with CSS inlining enabled', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: true,
      inlineCssOptions: {},
    });
    const mail = createMail('handlebars-template-media-query', { MAILER: 'TestMailer' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('@media only screen and (max-width:350px)');
    expect(html).toContain('Handlebars test template. by TestMailer');
  });

  it('should register custom helpers', async () => {
    const adapter = new HandlebarsAdapter({
      uppercase: (str: string) => str.toUpperCase(),
    });
    // The concat helper is also registered by default
    const mail = createMail('handlebars-template', { MAILER: 'test' });
    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toContain('test');
  });

  it('should cache compiled templates', async () => {
    const adapter = new HandlebarsAdapter(undefined, { inlineCssEnabled: false });
    const mail1 = createMail('handlebars-template', { MAILER: 'First' });
    const mail2 = createMail('handlebars-template', { MAILER: 'Second' });

    await compileAsync(adapter, mail1, baseOptions);
    await compileAsync(adapter, mail2, baseOptions);

    expect(mail1.data.html).toContain('First');
    expect(mail2.data.html).toContain('Second');
  });

  it('should handle absolute template paths', async () => {
    const adapter = new HandlebarsAdapter(undefined, { inlineCssEnabled: false });
    const absPath = path.join(templateDir, 'handlebars-template');
    const mail = createMail(absPath, { MAILER: 'AbsPath' });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: '' },
    });

    expect(html).toContain('AbsPath');
  });

  it('should return error for non-existent template', async () => {
    const adapter = new HandlebarsAdapter();
    const mail = createMail('non-existent', {});

    await expect(compileAsync(adapter, mail, baseOptions)).rejects.toThrow();
  });

  it('should compile partials when configured', async () => {
    const adapter = new HandlebarsAdapter(undefined, { inlineCssEnabled: false });
    const mail = createMail('handlebars-template', { MAILER: 'Partials' });

    const options: MailerOptions = {
      transport: { host: 'localhost', port: 25 },
      template: { dir: templateDir },
      options: {
        partials: {
          dir: path.join(templateDir, 'partials'),
        },
      },
    };

    const html = await compileAsync(adapter, mail, options);

    expect(html).toContain('Partials');
  });
});
