import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DynamicModule,
  Injectable,
  Logger,
  NotFoundException,
  RequestMethod,
  Type,
} from '@nestjs/common';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { Mailable, MailableContext } from '../interfaces/mailable.interface';
import { MailerService } from '../mailer.service';
import { MailerTestModule } from '../testing/mailer-test.module';
import {
  MAILER_PREVIEW_OPTIONS,
  MailerPreviewModule,
  MailerPreviewOptions,
} from './mailer-preview.module';

interface PreviewController {
  index(request: { originalUrl?: string; url?: string }): string;
  html(name: string, locale?: string): Promise<string>;
  text(name: string, locale?: string): Promise<string>;
}

@Injectable()
class WelcomeMail implements Mailable<{ name: string }> {
  render({ name }: { name: string }, { locale }: MailableContext) {
    const greeting = locale === 'es' ? 'Hola' : 'Hello';
    return {
      subject: `${greeting} ${name}`,
      html: `<p>${greeting} ${name}</p>`,
      text: `${greeting} ${name}`,
    };
  }
}

describe('MailerPreviewModule', () => {
  let moduleRef: TestingModule | undefined;
  let logSpy: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
    logSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  function controllerClass(dynamicModule: DynamicModule): Type<unknown> {
    expect(dynamicModule.controllers).toHaveLength(1);
    return dynamicModule.controllers![0];
  }

  async function createController(
    options: MailerPreviewOptions,
  ): Promise<PreviewController> {
    const preview = MailerPreviewModule.register(options);
    moduleRef = await Test.createTestingModule({
      imports: [MailerTestModule.register(), preview],
    }).compile();
    return moduleRef.get(controllerClass(preview)) as PreviewController;
  }

  describe('register', () => {
    it('should be disabled when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';

      expect(MailerPreviewModule.register({ previews: [] })).toEqual({
        module: MailerPreviewModule,
      });
      expect(logSpy).toHaveBeenCalledWith(
        'Email previews are off (NODE_ENV is "production"). Set NODE_ENV=development or `enabled: true` to serve them.',
      );
    });

    it.each([['staging'], [undefined]])(
      'should be off by default when NODE_ENV is %p',
      (env) => {
        if (env === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env;

        expect(MailerPreviewModule.register({ previews: [] })).toEqual({
          module: MailerPreviewModule,
        });
        expect(logSpy).toHaveBeenCalledWith(
          `Email previews are off (NODE_ENV is "${env ?? ''}"). Set NODE_ENV=development or \`enabled: true\` to serve them.`,
        );
      },
    );

    it('should be enabled in production when enabled is true', () => {
      process.env.NODE_ENV = 'production';

      const dynamicModule = MailerPreviewModule.register({
        previews: [],
        enabled: true,
      });

      controllerClass(dynamicModule);
      expect(logSpy).toHaveBeenCalledWith('Email previews served at /_mailer');
    });

    it('should be disabled outside production when enabled is false', () => {
      process.env.NODE_ENV = 'development';

      expect(
        MailerPreviewModule.register({ previews: [], enabled: false }),
      ).toEqual({ module: MailerPreviewModule });
      // Turned off on purpose: nothing to explain
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should provide the options and a controller at /_mailer by default', () => {
      process.env.NODE_ENV = 'test';
      const options = { previews: [] };

      const dynamicModule = MailerPreviewModule.register(options);
      const controller = controllerClass(dynamicModule);

      expect(dynamicModule.module).toBe(MailerPreviewModule);
      expect(dynamicModule.providers).toEqual([
        { provide: MAILER_PREVIEW_OPTIONS, useValue: options },
      ]);
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe('_mailer');
    });

    it('should strip leading and trailing slashes from the path', () => {
      const dynamicModule = MailerPreviewModule.register({
        previews: [],
        path: '//admin/emails/',
      });

      expect(
        Reflect.getMetadata(PATH_METADATA, controllerClass(dynamicModule)),
      ).toBe('admin/emails');
      expect(logSpy).toHaveBeenCalledWith(
        'Email previews served at /admin/emails',
      );
    });

    it('should route the index, the HTML and the text of each preview', () => {
      const proto = controllerClass(
        MailerPreviewModule.register({ previews: [] }),
      ).prototype;
      const route = (method: string) => ({
        path: Reflect.getMetadata(PATH_METADATA, proto[method]),
        method: Reflect.getMetadata(METHOD_METADATA, proto[method]),
        headers: Reflect.getMetadata(HEADERS_METADATA, proto[method]),
      });

      expect(route('index')).toEqual({
        path: '/',
        method: RequestMethod.GET,
        headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      });
      expect(route('html')).toEqual({
        path: ':name',
        method: RequestMethod.GET,
        headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      });
      expect(route('text')).toEqual({
        path: ':name/text',
        method: RequestMethod.GET,
        headers: [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      });
    });
  });

  describe('index', () => {
    it('should list the previews with escaped names and descriptions', async () => {
      const controller = await createController({
        previews: [
          {
            name: 'welcome',
            description: 'Sent after <signup> & login',
            mailable: WelcomeMail,
          },
          { name: 'a&b <c>', mail: { subject: 'x', text: 'x' } },
        ],
      });

      const page = controller.index({ originalUrl: '/_mailer' });

      expect(page).toContain('<title>Email previews</title>');
      expect(page).toContain(
        '<li><a href="/_mailer/welcome">welcome</a> · <a href="/_mailer/welcome/text">text</a>' +
          '<p>Sent after &lt;signup&gt; &amp; login</p></li>',
      );
      expect(page).toContain(
        '<li><a href="/_mailer/a%26b%20%3Cc%3E">a&amp;b &lt;c&gt;</a>' +
          ' · <a href="/_mailer/a%26b%20%3Cc%3E/text">text</a></li>',
      );
      expect(page).not.toContain('No previews registered');
    });

    it('should derive links from originalUrl, without trailing slashes or the query', async () => {
      const controller = await createController({
        previews: [{ name: 'welcome', mailable: WelcomeMail }],
      });

      const page = controller.index({
        originalUrl: '/api/_mailer//?tab=1',
        url: '/ignored',
      });

      expect(page).toContain('href="/api/_mailer/welcome"');
    });

    it('should fall back to the request url, escaped', async () => {
      const controller = await createController({
        previews: [{ name: 'welcome', mailable: WelcomeMail }],
      });

      expect(controller.index({ url: '/p"x/' })).toContain(
        'href="/p&quot;x/welcome"',
      );
    });

    it('should fall back to the configured path', async () => {
      const controller = await createController({
        path: 'emails',
        previews: [{ name: 'welcome', mailable: WelcomeMail }],
      });

      expect(controller.index({})).toContain('href="/emails/welcome"');
    });

    it('should say when no previews are registered', async () => {
      const controller = await createController({ previews: [] });

      expect(controller.index({})).toContain(
        '<ul><li>No previews registered</li></ul>',
      );
    });
  });

  describe('html', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-preview-'));
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('should render a mail class with its data', async () => {
      const controller = await createController({
        previews: [
          { name: 'welcome', mailable: WelcomeMail, data: { name: 'Ada' } },
        ],
      });

      await expect(controller.html('welcome')).resolves.toBe(
        '<p>Hello Ada</p>',
      );
    });

    it('should embed cid inline images as data URLs', async () => {
      const logoPath = path.join(tmp, 'logo.png');
      fs.writeFileSync(logoPath, 'from-disk');
      const controller = await createController({
        previews: [
          {
            name: 'images',
            mail: {
              subject: 'Images',
              html:
                '<img src="cid:buffer"><img src="cid:buffer">' +
                '<img src="cid:b64"><img src="cid:utf8"><img src="cid:file">' +
                '<img src="cid:missing"><img src="cid:nothing">',
              attachments: [
                {
                  cid: 'buffer',
                  content: Buffer.from('buf'),
                  contentType: 'image/png',
                },
                {
                  cid: 'b64',
                  content: Buffer.from('b64').toString('base64'),
                  encoding: 'base64',
                  contentType: 'image/gif',
                },
                { cid: 'utf8', content: 'text', contentType: 'text/plain' },
                { cid: 'file', path: logoPath },
                { cid: 'missing', path: path.join(tmp, 'missing.png') },
                { cid: 'nothing' },
                { filename: 'report.pdf', content: 'not inline' },
              ],
            },
          },
        ],
      });

      const html = await controller.html('images');
      const data = (type: string, content: string) =>
        `data:${type};base64,${Buffer.from(content).toString('base64')}`;

      expect(html).toBe(
        `<img src="${data('image/png', 'buf')}"><img src="${data('image/png', 'buf')}">` +
          `<img src="${data('image/gif', 'b64')}">` +
          `<img src="${data('text/plain', 'text')}">` +
          `<img src="${data('application/octet-stream', 'from-disk')}">` +
          // Images that can't be read keep their cid: URL
          '<img src="cid:missing"><img src="cid:nothing">',
      );
    });

    it('should show a text-only email as escaped preformatted text', async () => {
      const controller = await createController({
        previews: [{ name: 'plain', mail: { subject: 'x', text: 'a < b' } }],
      });

      await expect(controller.html('plain')).resolves.toBe(
        '<pre>a &lt; b</pre>',
      );
    });

    it('should say when an email has no body', async () => {
      const controller = await createController({
        previews: [{ name: 'empty', mail: { subject: 'Empty' } }],
      });

      await expect(controller.html('empty')).resolves.toBe(
        '<pre>(this email has no body)</pre>',
      );
    });

    it('should build the mail and the data from functions', async () => {
      const mail = jest.fn(async () => ({
        subject: 'x',
        html: '<b>built</b>',
      }));
      const data = jest.fn(async () => ({ name: 'Bo' }));
      const controller = await createController({
        previews: [
          { name: 'mail', mail },
          { name: 'mailable', mailable: WelcomeMail, data },
        ],
      });

      await expect(controller.html('mail')).resolves.toBe('<b>built</b>');
      await expect(controller.html('mailable')).resolves.toBe(
        '<p>Hello Bo</p>',
      );
      expect(mail).toHaveBeenCalledTimes(1);
      expect(data).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException for an unknown preview', async () => {
      const controller = await createController({
        previews: [{ name: 'welcome', mailable: WelcomeMail }],
      });

      await expect(controller.html('nope')).rejects.toThrow(
        new NotFoundException('No email preview "nope"'),
      );
      await expect(controller.text('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('locale', () => {
    it('should render a mail class in the preview locale, or the query one', async () => {
      const controller = await createController({
        previews: [
          { name: 'welcome', mailable: WelcomeMail, data: { name: 'Ada' } },
          {
            name: 'welcome-es',
            mailable: WelcomeMail,
            data: { name: 'Ada' },
            locale: 'es',
          },
        ],
      });

      await expect(controller.html('welcome-es')).resolves.toBe(
        '<p>Hola Ada</p>',
      );
      await expect(controller.html('welcome', 'es')).resolves.toBe(
        '<p>Hola Ada</p>',
      );
      await expect(controller.text('welcome-es', 'en')).resolves.toBe(
        'Hello Ada',
      );
    });

    it('should render an inline email with the query locale', async () => {
      const mail = { subject: 'x', html: '<p>x</p>', locale: 'en' };
      const controller = await createController({
        previews: [{ name: 'inline', mail }],
      });
      const render = jest.spyOn(moduleRef!.get(MailerService), 'render');

      await controller.html('inline');
      expect(render).toHaveBeenLastCalledWith(mail);

      await controller.html('inline', 'fr');
      expect(render).toHaveBeenLastCalledWith({ ...mail, locale: 'fr' });
      // The registered preview is not changed
      expect(mail.locale).toBe('en');
    });
  });

  describe('text', () => {
    it('should return the text body', async () => {
      const controller = await createController({
        previews: [
          { name: 'welcome', mailable: WelcomeMail, data: { name: 'Ada' } },
        ],
      });

      await expect(controller.text('welcome')).resolves.toBe('Hello Ada');
    });

    it('should return an empty string for an HTML-only email', async () => {
      const controller = await createController({
        previews: [{ name: 'html', mail: { subject: 'x', html: '<p>x</p>' } }],
      });

      await expect(controller.text('html')).resolves.toBe('');
    });
  });
});
