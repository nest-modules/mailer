import * as path from 'node:path';
import { HandlebarsAdapter } from '../adapters/handlebars.adapter';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterEngine } from './template-adapter.engine';

const dir = path.join(__dirname, '..', 'test-templates', 'nestjs-mail');
const extra = path.join(dir, 'extra');

function engine(
  overrides: Partial<
    ConstructorParameters<typeof TemplateAdapterEngine>[0]
  > = {},
) {
  return new TemplateAdapterEngine({
    adapter: new HandlebarsAdapter(undefined, { inlineCssEnabled: false }),
    dir,
    ...overrides,
  });
}

function fakeAdapter(compile: TemplateAdapter['compile']): TemplateAdapter {
  return { compile };
}

describe('TemplateAdapterEngine', () => {
  it('renders a template with its context', async () => {
    await expect(
      engine().render('welcome', { name: 'Ada' }, { locale: undefined }),
    ).resolves.toBe('<p>Hello Ada</p>\n');
  });

  it('inlines CSS by default', async () => {
    const html = await new TemplateAdapterEngine({
      adapter: new HandlebarsAdapter(),
      dir,
    }).render('welcome', { name: 'Ada' }, { locale: undefined });
    expect(html).toContain('<p>Hello Ada</p>');
  });

  describe('locales', () => {
    it('finds the suffix layout (`welcome.es`)', async () => {
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: 'es' }),
      ).resolves.toBe('<p>Hola Ada</p>\n');
    });

    it('finds the folder layout (`fr/welcome`)', async () => {
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: 'fr' }),
      ).resolves.toBe('<p>Bonjour Ada</p>\n');
    });

    it('falls back from a region to its language', async () => {
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: 'es-CO' }),
      ).resolves.toBe('<p>Hola Ada</p>\n');
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: 'fr_CA' }),
      ).resolves.toBe('<p>Bonjour Ada</p>\n');
    });

    it('falls back to the unlocalized template', async () => {
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: 'de' }),
      ).resolves.toBe('<p>Hello Ada</p>\n');
    });

    it('ignores a locale that is not a language tag', async () => {
      await expect(
        engine().render('welcome', { name: 'Ada' }, { locale: '../fr' }),
      ).resolves.toBe('<p>Hello Ada</p>\n');
    });

    it('passes the locale to the adapter', async () => {
      const compile = jest.fn((mail, callback) => {
        mail.data.html = mail.data.locale;
        callback();
      });
      await expect(
        engine({ adapter: fakeAdapter(compile) }).render(
          'welcome',
          {},
          { locale: 'es' },
        ),
      ).resolves.toBe('es');
      expect(compile.mock.calls[0][0].data.template).toBe('welcome.es.hbs');
    });
  });

  describe('dirs', () => {
    it('searches the extra directories', async () => {
      await expect(
        engine({ dirs: [extra] }).render(
          'other',
          { name: 'Ada' },
          { locale: undefined },
        ),
      ).resolves.toBe('<p>Extra Ada</p>\n');
    });

    it('finds localized templates in the extra directories', async () => {
      await expect(
        engine({ dirs: [extra] }).render(
          'other',
          { name: 'Ada' },
          { locale: 'es' },
        ),
      ).resolves.toBe('<p>Otra Ada</p>\n');
    });
  });

  describe('adapter options', () => {
    it('passes runtime options such as Handlebars partials and layout', async () => {
      const html = await engine({
        options: {
          partials: { dir: path.join(dir, 'partials') },
          layout: 'layout',
        },
      }).render('with-partial', { name: 'Ada' }, { locale: undefined });

      expect(html).toBe(
        '<div class="layout"><strong>Banner Ada</strong><p>Body for Ada</p>\n</div><footer>Footer Ada</footer>\n',
      );
    });

    it('passes compile options to the engine', async () => {
      await expect(
        engine({ templateOptions: { strict: true } }).render(
          'welcome',
          {},
          { locale: undefined },
        ),
      ).rejects.toThrow(/"name" not defined/);
    });

    it('hands the adapter the mailer options it expects', async () => {
      const compile = jest.fn((_mail, callback) => callback());
      const adapter = fakeAdapter(compile);
      await engine({
        adapter,
        dirs: [extra],
        templateOptions: { strict: true },
        options: { layout: 'layout' },
      }).render('welcome', { name: 'Ada' }, { locale: undefined });

      expect(compile).toHaveBeenCalledWith(
        {
          data: {
            template: 'welcome',
            context: { name: 'Ada' },
            locale: undefined,
          },
        },
        expect.any(Function),
        {
          template: {
            dir,
            dirs: [extra],
            adapter,
            options: { strict: true },
          },
          options: { layout: 'layout' },
        },
      );
    });
  });

  describe('errors', () => {
    it('marks a missing template as permanent', async () => {
      const error = await engine()
        .render('missing', {}, { locale: undefined })
        .catch((err) => err);
      expect(error).toMatchObject({ code: 'ENOENT', permanent: true });
      expect(Object.keys(error)).toContain('permanent');
    });

    it('marks a template that does not compile as permanent', async () => {
      await expect(
        engine().render('broken', {}, { locale: undefined }),
      ).rejects.toMatchObject({ permanent: true });
    });

    it('rethrows errors that are not objects', async () => {
      const failing = (error: unknown) =>
        engine({
          adapter: fakeAdapter(() => {
            throw error;
          }),
        }).render('welcome', {}, { locale: undefined });

      await expect(failing('boom')).rejects.toBe('boom');
      await expect(failing(null)).rejects.toBeNull();
    });

    it('rethrows errors an adapter passes to its callback', async () => {
      const adapter = fakeAdapter((_mail, callback) => callback('bad'));
      await expect(
        engine({ adapter }).render('welcome', {}, { locale: undefined }),
      ).rejects.toBe('bad');
    });
  });

  it('renders an empty body when the adapter sets no html', async () => {
    const adapter = fakeAdapter((_mail, callback) => callback());
    await expect(
      engine({ adapter }).render('welcome', {}, { locale: undefined }),
    ).resolves.toBe('');
  });

  it('stringifies a Buffer body', async () => {
    const adapter = fakeAdapter((mail, callback) => {
      mail.data.html = Buffer.from('<p>buffer</p>');
      callback();
    });
    await expect(
      engine({ adapter }).render('welcome', {}, { locale: undefined }),
    ).resolves.toBe('<p>buffer</p>');
  });
});
