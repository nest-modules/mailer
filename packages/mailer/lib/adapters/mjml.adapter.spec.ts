import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { EjsAdapter } from './ejs.adapter';
import { HandlebarsAdapter } from './handlebars.adapter';
import { PugAdapter } from './pug.adapter';

// Mock mjml since v5 alpha uses prettier which requires ESM dynamic imports.
// mjml v5+ returns a Promise from mjml2html (see issue #1312), so the default
// mock implementation resolves asynchronously to mirror real-world behavior.
// Individual tests override it to emulate mjml v4 (sync) or failures.
const mockMjml2html = jest.fn();

jest.mock('mjml', () => {
  return {
    __esModule: true,
    default: (...args: any[]) => mockMjml2html(...args),
  };
});

// Must import after mock
import { MjmlAdapter } from './mjml.adapter';

const mailerOptions: MailerOptions = {
  transport: { host: 'localhost', port: 25 },
};

function staticEngine(html: string): TemplateAdapter {
  return {
    compile(mail: any, callback: any, _options: MailerOptions) {
      mail.data.html = html;
      callback();
    },
  };
}

describe('MjmlAdapter', () => {
  beforeEach(() => {
    mockMjml2html.mockReset();
    mockMjml2html.mockImplementation((mjmlContent: string) =>
      Promise.resolve({
        html: `<html><body>${mjmlContent}</body></html>`,
      }),
    );
  });

  it('should create handlebars engine when "handlebars" string is passed', () => {
    const adapter = new MjmlAdapter('handlebars');
    expect((adapter as any).engine).toBeInstanceOf(HandlebarsAdapter);
  });

  it('should create pug engine when "pug" string is passed', () => {
    const adapter = new MjmlAdapter('pug');
    expect((adapter as any).engine).toBeInstanceOf(PugAdapter);
  });

  it('should create ejs engine when "ejs" string is passed', () => {
    const adapter = new MjmlAdapter('ejs');
    expect((adapter as any).engine).toBeInstanceOf(EjsAdapter);
  });

  it('should accept a TemplateAdapter instance directly', () => {
    const custom = new HandlebarsAdapter();
    const adapter = new MjmlAdapter(custom);
    expect((adapter as any).engine).toBe(custom);
  });

  it('should pass config to handlebars engine', () => {
    const adapter = new MjmlAdapter('handlebars', { inlineCssEnabled: false });
    const engine = (adapter as any).engine as HandlebarsAdapter;
    expect((engine as any).config.inlineCssEnabled).toBe(false);
  });

  it('should pass helpers to handlebars engine via others', () => {
    const helper = { myHelper: () => 'test' };
    const adapter = new MjmlAdapter('handlebars', undefined, {
      handlebar: { helper },
    });
    expect((adapter as any).engine).toBeInstanceOf(HandlebarsAdapter);
  });

  it('should handle undefined others parameter for handlebars', () => {
    expect(
      () => new MjmlAdapter('handlebars', undefined, undefined),
    ).not.toThrow();
  });

  it('should leave no engine for empty string input', () => {
    const adapter = new MjmlAdapter('');
    expect((adapter as any).engine).toBeNull();
  });

  it('should compile mail using the inner engine and transform through mjml', (done) => {
    const mockEngine: TemplateAdapter = {
      compile(mail: any, callback: any, _options: MailerOptions) {
        mail.data.html = '<mjml><mj-body>Hello</mj-body></mjml>';
        callback();
      },
    };

    const adapter = new MjmlAdapter(mockEngine);
    const mail = { data: { html: undefined as string | undefined } };

    adapter.compile(
      mail,
      () => {
        expect(mail.data.html).toContain('Hello');
        expect(mail.data.html).toContain('<html>');
        done();
      },
      { transport: { host: 'localhost', port: 25 } },
    );
  });

  it('should propagate errors raised by the inner engine', (done) => {
    const failingEngine: TemplateAdapter = {
      compile(_mail: any, callback: any, _options: MailerOptions) {
        callback(new Error('engine failure'));
      },
    };

    const adapter = new MjmlAdapter(failingEngine);
    const mail = { data: { html: undefined as string | undefined } };

    adapter.compile(
      mail,
      (err: any) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('engine failure');
        done();
      },
      { transport: { host: 'localhost', port: 25 } },
    );
  });

  it('should pass config to pug engine', () => {
    const adapter = new MjmlAdapter('pug', { inlineCssEnabled: false });
    const engine = (adapter as any).engine as PugAdapter;
    expect((engine as any).config.inlineCssEnabled).toBe(false);
  });

  it('should pass config to ejs engine', () => {
    const adapter = new MjmlAdapter('ejs', { inlineCssEnabled: false });
    const engine = (adapter as any).engine as EjsAdapter;
    expect((engine as any).config.inlineCssEnabled).toBe(false);
  });

  it('should keep an unknown engine name as-is', () => {
    const adapter = new MjmlAdapter('unknown' as any);
    expect((adapter as any).engine).toBe('unknown');
  });

  it('should pass the html produced by the inner engine to mjml', (done) => {
    const adapter = new MjmlAdapter(
      staticEngine('<mjml><mj-body>Source</mj-body></mjml>'),
    );
    const mail = { data: { html: undefined as string | undefined } };

    adapter.compile(
      mail,
      (err?: any) => {
        expect(err).toBeUndefined();
        expect(mockMjml2html).toHaveBeenCalledWith(
          '<mjml><mj-body>Source</mj-body></mjml>',
        );
        expect(mail.data.html).toBe(
          '<html><body><mjml><mj-body>Source</mj-body></mjml></body></html>',
        );
        done();
      },
      mailerOptions,
    );
  });

  it('should support the synchronous result returned by mjml v4', (done) => {
    mockMjml2html.mockReturnValue({ html: '<html>sync</html>' });
    const adapter = new MjmlAdapter(staticEngine('<mjml></mjml>'));
    const mail = { data: { html: undefined as string | undefined } };

    adapter.compile(
      mail,
      (err?: any) => {
        expect(err).toBeUndefined();
        expect(mail.data.html).toBe('<html>sync</html>');
        done();
      },
      mailerOptions,
    );
  });

  it('should propagate errors raised by mjml', (done) => {
    const failure = new Error('mjml failure');
    mockMjml2html.mockRejectedValue(failure);
    const adapter = new MjmlAdapter(staticEngine('<mjml></mjml>'));
    const mail = { data: { html: undefined as string | undefined } };

    adapter.compile(
      mail,
      (err?: any) => {
        expect(err).toBe(failure);
        expect(mail.data.html).toBe('<mjml></mjml>');
        done();
      },
      mailerOptions,
    );
  });

  it('should not call mjml when the inner engine fails', (done) => {
    const adapter = new MjmlAdapter({
      compile(_mail: any, callback: any) {
        callback(new Error('engine failure'));
      },
    });

    adapter.compile(
      { data: {} },
      (err?: any) => {
        expect(err.message).toBe('engine failure');
        expect(mockMjml2html).not.toHaveBeenCalled();
        done();
      },
      mailerOptions,
    );
  });

  it('should compile a real ejs template through mjml', (done) => {
    const adapter = new MjmlAdapter('ejs', { inlineCssEnabled: false });
    const mail = {
      data: {
        template: path.join(__dirname, '..', 'test-templates', 'ejs-template'),
        context: { MAILER: 'Mjml' },
        html: undefined as string | undefined,
      },
    };

    adapter.compile(
      mail,
      (err?: any) => {
        expect(err).toBeUndefined();
        expect(mail.data.html).toBe(
          '<html><body><p>Ejs test template. by Mjml</p></body></html>',
        );
        done();
      },
      mailerOptions,
    );
  });

  it('should complete without rendering when no engine is configured', () => {
    const adapter = new MjmlAdapter('');
    const callback = jest.fn();

    adapter.compile({ data: {} }, callback, mailerOptions);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith();
    expect(mockMjml2html).not.toHaveBeenCalled();
  });

  it('should complete when compile is invoked without a bound instance', () => {
    const adapter = new MjmlAdapter(staticEngine('<mjml></mjml>'));
    const { compile } = adapter;
    const callback = jest.fn();

    compile({ data: {} }, callback, mailerOptions);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should pass synchronous mjml errors to the callback', (done) => {
    mockMjml2html.mockImplementation(() => {
      throw new Error('mjml v4 failure');
    });
    const adapter = new MjmlAdapter(staticEngine('<mjml></mjml>'));

    adapter.compile(
      { data: {} },
      (err?: Error) => {
        expect(err?.message).toBe('mjml v4 failure');
        done();
      },
      mailerOptions,
    );
  });
});
