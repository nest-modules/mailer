/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as CSSInliner from 'css-inliner';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: { [name: string]: handlebars.TemplateDelegate } = {};

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const templateExt = path.extname(mail.data.template) || '.hbs';
    const templateName = path.basename(mail.data.template, path.extname(mail.data.template));
    const templateDir = path.dirname(mail.data.template) !== '.' ? path.dirname(mail.data.template) : get(mailerOptions, 'template.dir', '');
    const templatePath = path.join(templateDir, templateName + templateExt);

    if (!this.precompiledTemplates[templateName]) {
      try {
        const template = fs.readFileSync(templatePath, 'UTF-8');

        this.precompiledTemplates[templateName] = handlebars.compile(template, get(mailerOptions, 'template.options', {}));
      } catch (err) {
        return callback(err);
      }
    }

    const rendered = this.precompiledTemplates[templateName](mail.data.context);

    const { dir } = path.parse(templatePath);
    const inliner = new CSSInliner({ directory: dir });

    inliner.inlineCSSAsync(rendered).then((html) => {
      mail.data.html = html;
      return callback();
    });

  }
}
