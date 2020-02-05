/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as CSSInliner from 'css-inliner';
import * as glob from 'glob';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: { [name: string]: handlebars.TemplateDelegate } = {};

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const precompile = (template, callback, options) => {
      const templateExt = path.extname(template) || '.hbs';
      const templateName = path.basename(template, path.extname(template));
      const templateDir = path.dirname(template) !== '.' ? path.dirname(template) : get(options, 'dir', '');
      const templatePath = path.join(templateDir, templateName + templateExt);

      if (!this.precompiledTemplates[templateName]) {
        try {
          const template = fs.readFileSync(templatePath, 'UTF-8');

          this.precompiledTemplates[templateName] = handlebars.compile(template, get(options, 'options', {}));

          return {
            templateExt,
            templateName,
            templateDir,
            templatePath,
          };
        } catch (err) {
          return callback(err);
        }
      }
    };

    const {
      templateName,
      templatePath,
    } = precompile(mail.data.template, callback, mailerOptions.template);

    const { partials } = get(mailerOptions, 'template.options', {
      partials: false,
    })

    if (partials) {
      const files = glob.sync(path.join(partials.dir, '*.hbs'));
      files.forEach((file: string) => {
        precompile(file, () => {}, partials);  
      });
    }

    const rendered = this.precompiledTemplates[templateName](mail.data.context, {
      partials: this.precompiledTemplates
    });

    const { dir } = path.parse(templatePath);
    const inliner = new CSSInliner({ directory: dir });

    inliner.inlineCSSAsync(rendered).then((html) => {
      mail.data.html = html;
      return callback();
    });
  }
}
