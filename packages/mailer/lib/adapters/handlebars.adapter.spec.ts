import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { HandlebarsAdapter } from './handlebars.adapter';

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
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
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
    const mail = createMail('handlebars-template-media-query', {
      MAILER: 'TestMailer',
    });

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
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const mail1 = createMail('handlebars-template', { MAILER: 'First' });
    const mail2 = createMail('handlebars-template', { MAILER: 'Second' });

    await compileAsync(adapter, mail1, baseOptions);
    await compileAsync(adapter, mail2, baseOptions);

    expect(mail1.data.html).toContain('First');
    expect(mail2.data.html).toContain('Second');
  });

  it('should handle absolute template paths', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
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
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
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

  it('should register the built-in concat helper', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const mail = createMail('handlebars-concat-template', { name: 'Ada' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Hello, Ada!</p>\n');
  });

  it('should make custom helpers available to templates', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-hbs-helper-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'shout.hbs'), '<p>{{shout name}}</p>');
      const adapter = new HandlebarsAdapter(
        { shout: (value: string) => value.toUpperCase() },
        { inlineCssEnabled: false },
      );
      const mail = createMail('shout', { name: 'quiet' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe('<p>QUIET</p>');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should render registered partials', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const mail = createMail('handlebars-partial-template', {
      MAILER: 'Partials',
      title: 'Welcome',
    });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
      template: { dir: templateDir },
      options: { partials: { dir: path.join(templateDir, 'partials') } },
    });

    expect(html).toBe('<header>Welcome</header>\n<p>Body by Partials</p>\n');
  });

  it('should accept a template name with an explicit extension', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const mail = createMail('handlebars-template.hbs', { MAILER: 'WithExt' });

    const html = await compileAsync(adapter, mail, baseOptions);

    expect(html).toBe('<p>Handlebars test template. by WithExt</p>');
  });

  it('should resolve absolute paths without any template options', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const mail = createMail(path.join(templateDir, 'handlebars-template'), {
      MAILER: 'NoTemplateOptions',
    });

    const html = await compileAsync(adapter, mail, {
      transport: { host: 'localhost', port: 25 },
    });

    expect(html).toBe('<p>Handlebars test template. by NoTemplateOptions</p>');
  });

  it('should report a missing absolute template when no template options exist', async () => {
    const adapter = new HandlebarsAdapter();
    const mail = createMail(path.join(templateDir, 'does-not-exist'));

    // Only the error delivered to the callback is asserted here. The adapter
    // currently also throws a TypeError synchronously afterwards (see the
    // `precompile` destructuring issue), which the Promise wrapper swallows.
    await expect(
      compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
      }),
    ).rejects.toThrow(/ENOENT/);
  });

  it('should pass compile options from template.options to handlebars', async () => {
    const adapter = new HandlebarsAdapter(undefined, {
      inlineCssEnabled: false,
    });
    const escaped = createMail('handlebars-template', { MAILER: '<b>x</b>' });
    const raw = createMail('handlebars-template', { MAILER: '<b>x</b>' });

    // Separate adapters: compiled templates are cached per instance
    const escapedHtml = await compileAsync(adapter, escaped, baseOptions);
    const rawHtml = await compileAsync(
      new HandlebarsAdapter(undefined, { inlineCssEnabled: false }),
      raw,
      {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, options: { noEscape: true } },
      },
    );

    expect(escapedHtml).toBe(
      '<p>Handlebars test template. by &lt;b&gt;x&lt;/b&gt;</p>',
    );
    expect(rawHtml).toBe('<p>Handlebars test template. by <b>x</b></p>');
  });

  describe('template.dirs lookup', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-hbs-dirs-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should look up the template in additional template.dirs', async () => {
      const firstDir = path.join(tmpDir, 'first');
      const secondDir = path.join(tmpDir, 'second');
      fs.mkdirSync(firstDir);
      fs.mkdirSync(path.join(secondDir, 'nested'), { recursive: true });
      fs.writeFileSync(
        path.join(secondDir, 'nested', 'extra.hbs'),
        '<p>From second dir: {{name}}</p>',
      );

      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail('nested/extra', { name: 'Ada' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, dirs: [firstDir, secondDir] },
      });

      expect(html).toBe('<p>From second dir: Ada</p>');
    });

    it('should prefer template.dir over template.dirs when the template exists', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'handlebars-template.hbs'),
        '<p>Shadowed template</p>',
      );

      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail('handlebars-template', { MAILER: 'Primary' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir, dirs: [tmpDir] },
      });

      expect(html).toBe('<p>Handlebars test template. by Primary</p>');
    });
  });

  describe('layouts', () => {
    it('should wrap the rendered template in the configured layout', async () => {
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const options: MailerOptions = {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir },
        options: { layout: 'handlebars-layout' },
      };

      const first = createMail('handlebars-template', {
        MAILER: 'First',
        footer: 'Bye',
      });
      const second = createMail('handlebars-template', {
        MAILER: 'Second',
        footer: 'Later',
      });

      // The second compilation reuses the cached layout
      expect(await compileAsync(adapter, first, options)).toBe(
        '<main class="layout"><p>Handlebars test template. by First</p></main><footer>Bye</footer>\n',
      );
      expect(await compileAsync(adapter, second, options)).toBe(
        '<main class="layout"><p>Handlebars test template. by Second</p></main><footer>Later</footer>\n',
      );
    });

    it('should resolve an absolute layout path without template options', async () => {
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail(path.join(templateDir, 'handlebars-template'), {
        MAILER: 'Abs',
        footer: 'F',
      });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        options: { layout: path.join(templateDir, 'handlebars-layout') },
      });

      expect(html).toBe(
        '<main class="layout"><p>Handlebars test template. by Abs</p></main><footer>F</footer>\n',
      );
    });

    it('should render without a layout when the layout file is missing', async () => {
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail('handlebars-template', { MAILER: 'NoLayout' });

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: templateDir },
        options: { layout: 'missing-layout' },
      });

      expect(html).toBe('<p>Handlebars test template. by NoLayout</p>');
    });
  });

  describe('CSS handling', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-hbs-css-'));
      fs.writeFileSync(path.join(tmpDir, 'style.css'), 'p { color: red; }');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeTemplate(name: string, href: string) {
      fs.writeFileSync(
        path.join(tmpDir, `${name}.hbs`),
        `<link rel="stylesheet" href="${href}"><p>Styled</p>`,
      );
    }

    it('should replace a local stylesheet <link> with its contents and inline it', async () => {
      writeTemplate('local', 'style.css');
      const adapter = new HandlebarsAdapter();
      const mail = createMail('local');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).not.toContain('<link');
      expect(html).toContain('<p style="color: red;">Styled</p>');
    });

    it('should resolve stylesheets against cssBaseUrl when configured', async () => {
      const cssDir = path.join(tmpDir, 'assets');
      fs.mkdirSync(cssDir);
      fs.writeFileSync(path.join(cssDir, 'theme.css'), 'p { margin: 0; }');
      writeTemplate('themed', 'theme.css');

      const adapter = new HandlebarsAdapter(undefined, {
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
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail('remote');

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
        template: { dir: tmpDir },
      });

      expect(html).toBe(`<link rel="stylesheet" href="${href}"><p>Styled</p>`);
    });

    it('should keep the <link> tag when the local stylesheet does not exist', async () => {
      writeTemplate('missing-css', 'missing.css');
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
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
      const adapter = new HandlebarsAdapter(undefined, {
        inlineCssEnabled: false,
      });
      const mail = createMail(path.join(tmpDir, 'no-base'));

      const html = await compileAsync(adapter, mail, {
        transport: { host: 'localhost', port: 25 },
      });

      expect(html).toBe(
        '<link rel="stylesheet" href="style.css"><p>Styled</p>',
      );
    });

    it('should report a missing stylesheet as a CSS inlining error', async () => {
      writeTemplate('missing-css', 'missing.css');
      const adapter = new HandlebarsAdapter();
      const mail = createMail('missing-css');

      await expect(
        compileAsync(adapter, mail, {
          transport: { host: 'localhost', port: 25 },
          template: { dir: tmpDir },
        }),
      ).rejects.toThrow(/Missing stylesheet file: missing\.css/);
    });
  });
});
