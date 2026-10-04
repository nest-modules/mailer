import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { MailerEvent } from './interfaces/mailer-events.interface';
import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { MailerService } from './mailer.service';
import { MailerEventService } from './mailer-event.service';

/**
 * Minimal stand-in for a nodemailer Transporter. Only the members the
 * MailerService touches are implemented, so every interaction is observable.
 */
interface StubTransporter {
  use: jest.Mock;
  sendMail: jest.Mock;
  verify?: jest.Mock;
  close?: jest.Mock;
}

function createStubTransporter(
  overrides: Partial<StubTransporter> = {},
): StubTransporter {
  return {
    use: jest.fn(),
    sendMail: jest.fn(async (mail: ISendMailOptions) => ({
      messageId: 'stub-id',
      mail,
    })),
    ...overrides,
  };
}

/**
 * Transport factory that hands out the given stub transporters in order.
 * When the list is exhausted a fresh stub is created.
 */
function createStubFactory(
  ...stubs: StubTransporter[]
): MailerTransportFactory {
  const queue = [...stubs];
  return {
    createTransport: jest.fn(
      (_config?: TransportType) =>
        (queue.shift() ?? createStubTransporter()) as any,
    ),
  };
}

function createService(
  options: MailerOptions,
  factory?: MailerTransportFactory,
  eventService?: MailerEventService,
): MailerService {
  return new MailerService(options, factory as any, eventService);
}

/** Returns the mail options the stub transporter received on its last send */
function lastSentMail(stub: StubTransporter): ISendMailOptions {
  const { calls } = stub.sendMail.mock;
  return calls[calls.length - 1][0];
}

/**
 * Runs `fn` with `preview-email` replaced by `factory`. The mock lives in an
 * isolated module registry, so it never leaks into other tests. The service
 * must be constructed inside `fn`, because that is when it requires the module.
 */
function withPreviewEmail<T>(factory: () => unknown, fn: () => T): T {
  let result!: T;
  jest.isolateModules(() => {
    jest.doMock('preview-email', factory);
    result = fn();
  });
  jest.dontMock('preview-email');
  return result;
}

/** Template adapter that renders a fixed body and records its calls */
function createFakeAdapter(body = '<p>compiled</p>'): TemplateAdapter & {
  compile: jest.Mock;
} {
  return {
    compile: jest.fn((mail, callback) => {
      mail.data.html = body;
      callback();
    }),
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('MailerService (features)', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('transport validation', () => {
    it('should throw when transport is an empty object and no transports are given', () => {
      expect(() => createService({ transport: {} as any })).toThrow(
        'Make sure to provide a nodemailer transport configuration object',
      );
    });

    it('should accept named transports without a default transport', () => {
      const factory = createStubFactory();
      const service = createService(
        { transports: { a: 'smtp://a', b: 'smtp://b' } },
        factory,
      );

      expect(factory.createTransport).toHaveBeenCalledWith('smtp://a');
      expect(factory.createTransport).toHaveBeenCalledWith('smtp://b');
      expect(service.getTransporter()).toBeUndefined();
    });

    it('should fall back to the built-in transport factory when none is injected', async () => {
      const service = createService({ transport: { jsonTransport: true } });

      const info = await service.sendMail({
        from: 'a@example.test',
        to: 'b@example.test',
        subject: 'Built-in factory',
        text: 'body',
      });

      expect(JSON.parse(info.message).subject).toBe('Built-in factory');
    });
  });

  describe('preview option normalization', () => {
    it('should expand `preview: true` to non-blocking open defaults', () => {
      const options: MailerOptions = { transport: 'smtp://x', preview: true };
      createService(options, createStubFactory());

      expect(options.preview).toEqual({ open: { wait: false } });
    });

    it('should add open defaults when `open` is not provided', () => {
      const options: MailerOptions = {
        transport: 'smtp://x',
        preview: { dir: '/previews' },
      };
      createService(options, createStubFactory());

      expect(options.preview).toEqual({
        dir: '/previews',
        open: { wait: false },
      });
    });

    it('should default `wait` to false inside a user-provided open object', () => {
      const options: MailerOptions = {
        transport: 'smtp://x',
        preview: { open: { app: 'firefox' } },
      };
      createService(options, createStubFactory());

      expect(options.preview).toEqual({
        open: { app: 'firefox', wait: false },
      });
    });

    it('should keep a user-provided `wait` value', () => {
      const options: MailerOptions = {
        transport: 'smtp://x',
        preview: { open: { wait: true } },
      };
      createService(options, createStubFactory());

      expect(options.preview).toEqual({ open: { wait: true } });
    });

    it('should leave boolean `open` values untouched', () => {
      const preview = { dir: '/previews', open: false };
      const options: MailerOptions = { transport: 'smtp://x', preview };
      createService(options, createStubFactory());

      expect(options.preview).toBe(preview);
    });

    it('should leave a null `open` value untouched', () => {
      const preview = { open: null as any };
      const options: MailerOptions = { transport: 'smtp://x', preview };
      createService(options, createStubFactory());

      expect(options.preview).toBe(preview);
    });
  });

  describe('template adapter plugins', () => {
    it('should compile through the adapter when the mail has no html', async () => {
      const adapter = createFakeAdapter();
      const options: MailerOptions = {
        transport: { jsonTransport: true },
        template: { adapter },
      };
      const service = createService(options);

      const info = await service.sendMail({
        from: 'a@example.test',
        to: 'b@example.test',
        template: 'welcome',
      });

      expect(adapter.compile).toHaveBeenCalledTimes(1);
      expect(adapter.compile.mock.calls[0][2]).toBe(options);
      expect(JSON.parse(info.message).html).toBe('<p>compiled</p>');
    });

    it('should skip the adapter when html is already provided', async () => {
      const adapter = createFakeAdapter();
      const service = createService({
        transport: { jsonTransport: true },
        template: { adapter },
      });

      const info = await service.sendMail({
        from: 'a@example.test',
        to: 'b@example.test',
        html: '<p>raw</p>',
      });

      expect(adapter.compile).not.toHaveBeenCalled();
      expect(JSON.parse(info.message).html).toBe('<p>raw</p>');
    });

    it('should only register the compile step when preview is disabled', () => {
      const stub = createStubTransporter();
      createService(
        { transport: 'smtp://x', template: { adapter: createFakeAdapter() } },
        createStubFactory(stub),
      );

      expect(stub.use).toHaveBeenCalledTimes(1);
      expect(stub.use).toHaveBeenCalledWith('compile', expect.any(Function));
    });

    it('should not register any plugin without an adapter or plugins', () => {
      const stub = createStubTransporter();
      createService({ transport: 'smtp://x' }, createStubFactory(stub));

      expect(stub.use).not.toHaveBeenCalled();
    });
  });

  describe('email preview', () => {
    it('should pass the rendered mail and preview options to preview-email', async () => {
      const previewEmail = jest.fn().mockResolvedValue(undefined);
      const options: MailerOptions = {
        transport: { jsonTransport: true },
        template: { adapter: createFakeAdapter() },
        preview: { dir: '/previews' },
      };
      const service = withPreviewEmail(
        () => previewEmail,
        () => createService(options),
      );

      const info = await service.sendMail({
        from: 'a@example.test',
        to: 'b@example.test',
        subject: 'Preview',
        template: 'welcome',
      });

      expect(previewEmail).toHaveBeenCalledTimes(1);
      const [mailData, previewOptions] = previewEmail.mock.calls[0];
      expect(mailData.subject).toBe('Preview');
      expect(mailData.html).toBe('<p>compiled</p>');
      expect(previewOptions).toEqual({
        dir: '/previews',
        open: { wait: false },
      });
      expect(JSON.parse(info.message).subject).toBe('Preview');
    });

    it('should fail the send when preview-email rejects', async () => {
      const previewEmail = jest
        .fn()
        .mockRejectedValue(new Error('preview failed'));
      const service = withPreviewEmail(
        () => previewEmail,
        () =>
          createService({
            transport: { jsonTransport: true },
            template: { adapter: createFakeAdapter() },
            preview: true,
          }),
      );

      await expect(
        service.sendMail({ to: 'b@example.test', template: 'welcome' }),
      ).rejects.toThrow('preview failed');
    });

    it('should warn and skip the preview when preview-email is not installed', async () => {
      const service = withPreviewEmail(
        () => {
          throw new Error("Cannot find module 'preview-email'");
        },
        () =>
          createService({
            transport: { jsonTransport: true },
            template: { adapter: createFakeAdapter() },
            preview: true,
          }),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('preview-email is not installed'),
      );

      const info = await service.sendMail({
        from: 'a@example.test',
        to: 'b@example.test',
        template: 'welcome',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        'previewEmail is not available. Skipping preview.',
      );
      expect(JSON.parse(info.message).html).toBe('<p>compiled</p>');
    });
  });

  describe('user plugins', () => {
    it('should register plugins on the default and named transporters', () => {
      const defaultStub = createStubTransporter();
      const namedStub = createStubTransporter();
      const plugin = jest.fn();

      createService(
        {
          transport: 'smtp://default',
          transports: { named: 'smtp://named' },
          plugins: [{ step: 'stream', plugin }],
        },
        // Named transports are created before the default one
        createStubFactory(namedStub, defaultStub),
      );

      expect(defaultStub.use).toHaveBeenCalledWith('stream', plugin);
      expect(namedStub.use).toHaveBeenCalledWith('stream', plugin);
    });

    it('should run compile plugins before the mail is sent', async () => {
      const service = createService({
        transport: { jsonTransport: true },
        plugins: [
          {
            step: 'compile',
            plugin: (mail, callback) => {
              mail.data.subject = `[tag] ${mail.data.subject}`;
              callback();
            },
          },
        ],
      });

      const info = await service.sendMail({
        to: 'b@example.test',
        subject: 'Hello',
        text: 'body',
      });

      expect(JSON.parse(info.message).subject).toBe('[tag] Hello');
    });
  });

  describe('verifyTransporters option', () => {
    it('should log when the default and named transporters are ready', async () => {
      const named = createStubTransporter({
        verify: jest.fn().mockResolvedValue(true),
      });
      const fallback = createStubTransporter({
        verify: jest.fn().mockResolvedValue(true),
      });

      createService(
        {
          transport: 'smtp://default',
          transports: { named: 'smtp://named' },
          verifyTransporters: true,
        },
        createStubFactory(named, fallback),
      );
      await flushPromises();

      expect(named.verify).toHaveBeenCalled();
      expect(fallback.verify).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith("Transporter 'named' is ready");
      expect(logSpy).toHaveBeenCalledWith('Transporter is ready');
    });

    it('should log an error when verification fails', async () => {
      const stub = createStubTransporter({
        verify: jest.fn().mockRejectedValue(new Error('auth failed')),
      });

      createService(
        { transport: 'smtp://default', verifyTransporters: true },
        createStubFactory(stub),
      );
      await flushPromises();

      expect(errorSpy).toHaveBeenCalledWith(
        'Error occurred while verifying the transporter: auth failed',
      );
    });

    it('should skip verification for transports without verify()', async () => {
      createService(
        { transport: 'smtp://default', verifyTransporters: true },
        createStubFactory(createStubTransporter()),
      );
      await flushPromises();

      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should not verify unless the option is enabled', () => {
      const stub = createStubTransporter({ verify: jest.fn() });
      createService({ transport: 'smtp://default' }, createStubFactory(stub));

      expect(stub.verify).not.toHaveBeenCalled();
    });
  });

  describe('verifyAllTransporters', () => {
    it('should return true when every transporter verifies', async () => {
      const service = createService(
        { transport: 'smtp://default', transports: { named: 'smtp://named' } },
        createStubFactory(
          createStubTransporter({ verify: jest.fn().mockResolvedValue(true) }),
          createStubTransporter({ verify: jest.fn().mockResolvedValue(true) }),
        ),
      );

      await expect(service.verifyAllTransporters()).resolves.toBe(true);
    });

    it('should return false when any transporter fails to verify', async () => {
      const service = createService(
        { transport: 'smtp://default', transports: { named: 'smtp://named' } },
        createStubFactory(
          createStubTransporter({
            verify: jest.fn().mockRejectedValue(new Error('down')),
          }),
          createStubTransporter({ verify: jest.fn().mockResolvedValue(true) }),
        ),
      );

      await expect(service.verifyAllTransporters()).resolves.toBe(false);
    });

    it('should treat transporters without verify() as verified', async () => {
      const service = createService(
        { transport: 'smtp://default' },
        createStubFactory(createStubTransporter()),
      );

      await expect(service.verifyAllTransporters()).resolves.toBe(true);
    });

    it('should verify named transporters when there is no default one', async () => {
      const named = createStubTransporter({
        verify: jest.fn().mockResolvedValue(true),
      });
      const service = createService(
        { transports: { named: 'smtp://named' } },
        createStubFactory(named),
      );

      await expect(service.verifyAllTransporters()).resolves.toBe(true);
      expect(named.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the default and named transporters', async () => {
      const named = createStubTransporter({ close: jest.fn() });
      const fallback = createStubTransporter({ close: jest.fn() });
      const service = createService(
        { transport: 'smtp://default', transports: { named: 'smtp://named' } },
        createStubFactory(named, fallback),
      );

      await service.onModuleDestroy();

      expect(named.close).toHaveBeenCalledTimes(1);
      expect(fallback.close).toHaveBeenCalledTimes(1);
    });

    it('should close named transporters when there is no default one', async () => {
      const named = createStubTransporter({ close: jest.fn() });
      const service = createService(
        { transports: { named: 'smtp://named' } },
        createStubFactory(named),
      );

      await service.onModuleDestroy();

      expect(named.close).toHaveBeenCalledTimes(1);
    });

    it('should ignore transporters without close()', async () => {
      const service = createService(
        { transport: 'smtp://default' },
        createStubFactory(createStubTransporter()),
      );

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should log a warning when close() throws', async () => {
      const stub = createStubTransporter({
        close: jest.fn(() => {
          throw new Error('socket busy');
        }),
      });
      const service = createService(
        { transport: 'smtp://default' },
        createStubFactory(stub),
      );

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Error closing transporter: socket busy',
      );
    });
  });

  describe('subject interpolation', () => {
    it('should replace known placeholders and keep unknown ones', async () => {
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
      );

      await service.sendMail({
        subject: 'Hi {{ name }}, order {{id}} {{ missing }}',
        context: { name: 'Ana', id: 42 },
      });

      expect(lastSentMail(stub).subject).toBe('Hi Ana, order 42 {{missing}}');
    });

    it('should leave the subject untouched without a context', async () => {
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
      );

      await service.sendMail({ subject: 'Hi {{name}}' });

      expect(lastSentMail(stub).subject).toBe('Hi {{name}}');
    });
  });

  describe('inline html interpolation', () => {
    let stub: StubTransporter;
    let service: MailerService;

    beforeEach(() => {
      stub = createStubTransporter();
      service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
      );
    });

    it('should interpolate an html string when no template is set', async () => {
      await service.sendMail({
        html: '<p>{{ greeting }} {{name}}{{unknown}}</p>',
        context: { greeting: 'Hello', name: 'Ana' },
      });

      expect(lastSentMail(stub).html).toBe('<p>Hello Ana{{unknown}}</p>');
    });

    it('should not interpolate html when a template is also set', async () => {
      await service.sendMail({
        html: '<p>{{name}}</p>',
        template: 'welcome',
        context: { name: 'Ana' },
      });

      expect(lastSentMail(stub).html).toBe('<p>{{name}}</p>');
    });

    it('should not touch Buffer html', async () => {
      const html = Buffer.from('<p>{{name}}</p>');
      await service.sendMail({ html, context: { name: 'Ana' } });

      expect(lastSentMail(stub).html).toBe(html);
    });

    it('should not interpolate html without a context', async () => {
      await service.sendMail({ html: '<p>{{name}}</p>' });

      expect(lastSentMail(stub).html).toBe('<p>{{name}}</p>');
    });
  });

  describe('text templates', () => {
    let dir: string;
    let stub: StubTransporter;
    let service: MailerService;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-text-'));
      fs.writeFileSync(
        path.join(dir, 'welcome.txt'),
        'Hello {{ name }}, {{unknown}}',
      );
      fs.mkdirSync(path.join(dir, 'nested'));
      fs.writeFileSync(path.join(dir, 'nested', 'note.md'), '# {{title}}');
      stub = createStubTransporter();
      service = createService(
        { transport: 'smtp://x', template: { dir } },
        createStubFactory(stub),
      );
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should render a .txt template when no extension is given', async () => {
      await service.sendMail({
        textTemplate: 'welcome',
        context: { name: 'Ana' },
      });

      expect(lastSentMail(stub).text).toBe('Hello Ana, {{unknown}}');
    });

    it('should honour an explicit extension and sub-directory', async () => {
      await service.sendMail({
        textTemplate: 'nested/note.md',
        context: { title: 'News' },
      });

      expect(lastSentMail(stub).text).toBe('# News');
    });

    it('should fall back to empty text and warn when the file is missing', async () => {
      await service.sendMail({
        textTemplate: 'missing',
        context: { name: 'Ana' },
      });

      expect(lastSentMail(stub).text).toBe('');
      expect(warnSpy).toHaveBeenCalledWith(
        `Text template "${path.join(dir, 'missing.txt')}" not found, skipping text fallback.`,
      );
    });

    it('should ignore the text template without a context', async () => {
      await service.sendMail({ textTemplate: 'welcome', text: 'plain' });

      expect(lastSentMail(stub).text).toBe('plain');
    });

    it('should ignore the text template without a template dir', async () => {
      const other = createStubTransporter();
      const noDir = createService(
        { transport: 'smtp://x' },
        createStubFactory(other),
      );

      await noDir.sendMail({ textTemplate: 'welcome', context: { a: 1 } });

      expect(lastSentMail(other).text).toBeUndefined();
    });
  });

  describe('i18n template resolution', () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-i18n-'));
      fs.mkdirSync(path.join(dir, 'es'));
      fs.writeFileSync(path.join(dir, 'es', 'welcome.hbs'), 'Hola');
      fs.mkdirSync(path.join(dir, 'locales', 'fr'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'locales', 'fr', 'welcome.html'), 'Bon');
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    async function sentTemplate(
      options: Partial<MailerOptions>,
      mail: ISendMailOptions,
    ): Promise<string | undefined> {
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x', ...options },
        createStubFactory(stub),
      );
      await service.sendMail(mail);
      return lastSentMail(stub).template;
    }

    it('should use the localized template when it exists', async () => {
      await expect(
        sentTemplate(
          { template: { dir }, i18n: { defaultLocale: 'en' } },
          { template: 'welcome', locale: 'es' },
        ),
      ).resolves.toBe(path.join('es', 'welcome'));
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should support a custom directory pattern', async () => {
      await expect(
        sentTemplate(
          {
            template: { dir },
            i18n: {
              defaultLocale: 'en',
              templateDirPattern: 'locales/{{locale}}',
            },
          },
          { template: 'welcome', locale: 'fr' },
        ),
      ).resolves.toBe(path.join('locales', 'fr', 'welcome'));
    });

    it('should fall back to the default locale when the template is missing', async () => {
      await expect(
        sentTemplate(
          { template: { dir }, i18n: { defaultLocale: 'en' } },
          { template: 'welcome', locale: 'de' },
        ),
      ).resolves.toBe(path.join('en', 'welcome'));
      expect(debugSpy).toHaveBeenCalledWith(
        `Template "${path.join('de', 'welcome')}" not found for locale "de", falling back to "en"`,
      );
    });

    it('should fall back without checking files when there is no template dir', async () => {
      await expect(
        sentTemplate(
          { i18n: { defaultLocale: 'en' } },
          { template: 'welcome', locale: 'es' },
        ),
      ).resolves.toBe(path.join('en', 'welcome'));
    });

    it('should keep the localized path when fallback is disabled', async () => {
      await expect(
        sentTemplate(
          { template: { dir }, i18n: { defaultLocale: 'en', fallback: false } },
          { template: 'welcome', locale: 'de' },
        ),
      ).resolves.toBe(path.join('de', 'welcome'));
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should not fall back when the requested locale is the default one', async () => {
      await expect(
        sentTemplate(
          { template: { dir }, i18n: { defaultLocale: 'en' } },
          { template: 'welcome', locale: 'en' },
        ),
      ).resolves.toBe(path.join('en', 'welcome'));
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('should not localize without i18n options', async () => {
      await expect(
        sentTemplate(
          { template: { dir } },
          { template: 'welcome', locale: 'es' },
        ),
      ).resolves.toBe('welcome');
    });

    it('should not localize without a locale', async () => {
      await expect(
        sentTemplate(
          { template: { dir }, i18n: { defaultLocale: 'en' } },
          { template: 'welcome' },
        ),
      ).resolves.toBe('welcome');
    });
  });

  describe('template resolver', () => {
    function createResolverService(
      resolve: jest.Mock,
    ): [MailerService, StubTransporter] {
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x', template: { resolver: { resolve } } },
        createStubFactory(stub),
      );
      return [service, stub];
    }

    it('should use the resolved content and metadata subject', async () => {
      const resolve = jest.fn().mockResolvedValue({
        content: '<p>From DB</p>',
        metadata: { subject: 'Resolved subject' },
      });
      const [service, stub] = createResolverService(resolve);

      await service.sendMail({ template: 'welcome', context: { a: 1 } });

      expect(resolve).toHaveBeenCalledWith('welcome', { a: 1 });
      expect(lastSentMail(stub)).toEqual(
        expect.objectContaining({
          html: '<p>From DB</p>',
          subject: 'Resolved subject',
        }),
      );
    });

    it('should keep an explicit subject over the metadata subject', async () => {
      const resolve = jest.fn().mockResolvedValue({
        content: '<p>From DB</p>',
        metadata: { subject: 'Resolved subject' },
      });
      const [service, stub] = createResolverService(resolve);

      await service.sendMail({ template: 'welcome', subject: 'Explicit' });

      expect(lastSentMail(stub).subject).toBe('Explicit');
    });

    it('should not set a subject when metadata has none', async () => {
      const resolve = jest.fn().mockResolvedValue({
        content: '<p>From DB</p>',
        metadata: { from: 'x@example.test' },
      });
      const [service, stub] = createResolverService(resolve);

      await service.sendMail({ template: 'welcome' });

      expect(lastSentMail(stub).html).toBe('<p>From DB</p>');
      expect(lastSentMail(stub).subject).toBeUndefined();
    });

    it('should handle a resolved template without metadata', async () => {
      const resolve = jest.fn().mockResolvedValue({ content: 'plain' });
      const [service, stub] = createResolverService(resolve);

      await service.sendMail({ template: 'welcome' });

      expect(lastSentMail(stub).html).toBe('plain');
      expect(lastSentMail(stub).subject).toBeUndefined();
    });

    it('should not call the resolver when html is provided', async () => {
      const resolve = jest.fn();
      const [service, stub] = createResolverService(resolve);

      await service.sendMail({ template: 'welcome', html: '<p>inline</p>' });

      expect(resolve).not.toHaveBeenCalled();
      expect(lastSentMail(stub).html).toBe('<p>inline</p>');
    });

    it('should not call the resolver without a template', async () => {
      const resolve = jest.fn();
      const [service] = createResolverService(resolve);

      await service.sendMail({ text: 'plain' });

      expect(resolve).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    function createEventService(): [MailerEventService, jest.Mock] {
      const emit = jest.fn();
      return [new MailerEventService({ emit }), emit];
    }

    it('should emit before_send and after_send around a successful send', async () => {
      const [eventService, emit] = createEventService();
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
        eventService,
      );

      const result = await service.sendMail({ subject: 'Evented' });

      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenNthCalledWith(1, MailerEvent.BEFORE_SEND, {
        mailOptions: { subject: 'Evented' },
        timestamp: expect.any(Date),
      });
      expect(emit).toHaveBeenNthCalledWith(2, MailerEvent.AFTER_SEND, {
        mailOptions: { subject: 'Evented' },
        result,
        timestamp: expect.any(Date),
      });
    });

    it('should emit send_error and rethrow when sending fails', async () => {
      const [eventService, emit] = createEventService();
      const failure = new Error('smtp down');
      const stub = createStubTransporter({
        sendMail: jest.fn().mockRejectedValue(failure),
      });
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
        eventService,
      );

      await expect(service.sendMail({ subject: 'Boom' })).rejects.toBe(failure);
      expect(emit).toHaveBeenLastCalledWith(MailerEvent.SEND_ERROR, {
        mailOptions: { subject: 'Boom' },
        error: failure,
        timestamp: expect.any(Date),
      });
      expect(emit).not.toHaveBeenCalledWith(
        MailerEvent.AFTER_SEND,
        expect.anything(),
      );
    });

    it('should still reject without an event service', async () => {
      const stub = createStubTransporter({
        sendMail: jest.fn().mockRejectedValue(new Error('smtp down')),
      });
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
      );

      await expect(service.sendMail({})).rejects.toThrow('smtp down');
    });
  });

  describe('send timeout', () => {
    it('should reject when the per-mail timeout elapses', async () => {
      jest.useFakeTimers();
      const emit = jest.fn();
      const eventService = new MailerEventService({ emit });
      const stub = createStubTransporter({
        sendMail: jest.fn(() => new Promise(() => undefined)),
      });
      const service = createService(
        { transport: 'smtp://x' },
        createStubFactory(stub),
        eventService,
      );

      const pending = expect(service.sendMail({ timeout: 50 })).rejects.toThrow(
        'Send mail timed out after 50ms',
      );
      jest.advanceTimersByTime(49);
      expect(jest.getTimerCount()).toBe(1);
      jest.advanceTimersByTime(1);
      await pending;

      expect(emit).toHaveBeenLastCalledWith(
        MailerEvent.SEND_ERROR,
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it('should apply the global sendTimeout and clear it on success', async () => {
      jest.useFakeTimers();
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x', sendTimeout: 1000 },
        createStubFactory(stub),
      );

      await expect(service.sendMail({ subject: 'fast' })).resolves.toEqual(
        expect.objectContaining({ messageId: 'stub-id' }),
      );
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should propagate transport errors and clear the timer', async () => {
      jest.useFakeTimers();
      const stub = createStubTransporter({
        sendMail: jest.fn().mockRejectedValue(new Error('rejected')),
      });
      const service = createService(
        { transport: 'smtp://x', sendTimeout: 1000 },
        createStubFactory(stub),
      );

      await expect(service.sendMail({})).rejects.toThrow('rejected');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should let a per-mail timeout of 0 disable the global timeout', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const stub = createStubTransporter();
      const service = createService(
        { transport: 'smtp://x', sendTimeout: 1000 },
        createStubFactory(stub),
      );

      await service.sendMail({ timeout: 0 });

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(stub.sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTransporter', () => {
    let fallback: StubTransporter;
    let named: StubTransporter;
    let service: MailerService;

    beforeEach(() => {
      named = createStubTransporter();
      fallback = createStubTransporter();
      service = createService(
        { transport: 'smtp://default', transports: { named: 'smtp://named' } },
        createStubFactory(named, fallback),
      );
    });

    it('should return the default transporter without a name', () => {
      expect(service.getTransporter()).toBe(fallback);
    });

    it('should return a named transporter', () => {
      expect(service.getTransporter('named')).toBe(named);
    });

    it('should throw for an unknown name', () => {
      expect(() => service.getTransporter('nope')).toThrow(
        new ReferenceError("Transporters object doesn't have nope key"),
      );
    });
  });

  describe('removeTransporter', () => {
    it('should close and remove an existing transporter', () => {
      const named = createStubTransporter({ close: jest.fn() });
      const service = createService(
        { transport: 'smtp://default', transports: { named: 'smtp://named' } },
        createStubFactory(named),
      );

      expect(service.removeTransporter('named')).toBe(true);
      expect(named.close).toHaveBeenCalledTimes(1);
      expect(() => service.getTransporter('named')).toThrow(ReferenceError);
    });

    it('should return false for an unknown transporter', () => {
      const service = createService(
        { transport: 'smtp://default' },
        createStubFactory(),
      );

      expect(service.removeTransporter('nope')).toBe(false);
    });
  });
});
