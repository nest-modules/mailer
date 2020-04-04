/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as inlineCss from 'inline-css';
import * as glob from 'glob';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: handlebars.TemplateDelegate;
  } = {};

  constructor() {
    handlebars.registerHelper('concat', (...args) => {
      args.pop();
      return args.join('');
    });
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const precompile = (template: any, callback: any, options: any) => {
      const templateExt = path.extname(template) || '.hbs';
      const templateName = path.basename(template, path.extname(template));
      const templateDir =
        path.dirname(template) !== '.'
          ? path.dirname(template)
          : get(options, 'dir', '');
      const templatePath = path.join(templateDir, templateName + templateExt);

      if (!this.precompiledTemplates[templateName]) {
        try {
          const template = fs.readFileSync(templatePath, 'UTF-8');

          this.precompiledTemplates[templateName] = handlebars.compile(
            template,
            get(options, 'options', {}),
          );
        } catch (err) {
          return callback(err);
        }
      }

      return {
        templateExt,
        templateName,
        templateDir,
        templatePath,
      };
    };

    const { templateName, templatePath } = precompile(
      mail.data.template,
      callback,
      mailerOptions.template,
    );

    const runtimeOptions = get(mailerOptions, 'options', {
      partials: false,
      data: {},
    });

    if (runtimeOptions.partials) {
      const files = glob.sync(path.join(runtimeOptions.partials.dir, '*.hbs'));
      files.forEach((file) =>
        precompile(file, () => {}, runtimeOptions.partials),
      );
    }

    const rendered = this.precompiledTemplates[templateName](
      mail.data.context,
      {
        ...runtimeOptions,
        partials: this.precompiledTemplates,
      },
    );

    inlineCss(rendered, { url: ' ' }).then((html) => {
      mail.data.html = html;
      return callback();
    });
  }
}
