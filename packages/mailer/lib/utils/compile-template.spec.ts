import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { compileTemplate } from './compile-template';

describe('compileTemplate', () => {
  it('should run the adapter on the data and resolve', async () => {
    const options = { template: { dir: '/templates' } };
    const adapter: TemplateAdapter = {
      compile: jest.fn((mail, callback) => {
        mail.data.html = `<p>${mail.data.context.name}</p>`;
        callback();
      }),
    };
    const data: Record<string, any> = {
      template: 'x',
      context: { name: 'Ada' },
    };

    await compileTemplate(adapter, data, options);

    expect(data.html).toBe('<p>Ada</p>');
    expect(adapter.compile).toHaveBeenCalledWith(
      { data },
      expect.any(Function),
      options,
    );
  });

  it('should reject with the error the adapter reports', async () => {
    const adapter: TemplateAdapter = {
      compile: (_mail, callback) => callback(new Error('missing template')),
    };
    await expect(compileTemplate(adapter, {}, {})).rejects.toThrow(
      'missing template',
    );
  });

  it('should reject when the adapter throws', async () => {
    const adapter: TemplateAdapter = {
      compile: () => {
        throw new TypeError('bad template');
      },
    };
    await expect(compileTemplate(adapter, {}, {})).rejects.toThrow(
      'bad template',
    );
  });
});
