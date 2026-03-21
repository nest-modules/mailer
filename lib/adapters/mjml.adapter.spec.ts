import { HandlebarsAdapter } from './handlebars.adapter';
import { PugAdapter } from './pug.adapter';
import { EjsAdapter } from './ejs.adapter';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { MailerOptions } from '../interfaces/mailer-options.interface';

// Mock mjml since v5 alpha uses prettier which requires ESM dynamic imports
jest.mock('mjml', () => {
  return {
    __esModule: true,
    default: (mjmlContent: string) => ({
      html: `<html><body>${mjmlContent}</body></html>`,
    }),
  };
});

// Must import after mock
import { MjmlAdapter } from './mjml.adapter';

describe('MjmlAdapter', () => {
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
    expect(() => new MjmlAdapter('handlebars', undefined, undefined)).not.toThrow();
  });

  it('should set engine to empty string for empty string input', () => {
    const adapter = new MjmlAdapter('');
    expect((adapter as any).engine).toBe('');
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

    adapter.compile(mail, () => {
      expect(mail.data.html).toContain('Hello');
      expect(mail.data.html).toContain('<html>');
      done();
    }, { transport: { host: 'localhost', port: 25 } });
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
});
