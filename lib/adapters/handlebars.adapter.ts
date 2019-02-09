/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: { [name: string]: handlebars.TemplateDelegate } = {};

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const templateExt = path.extname(mail.data.template) || '.hbs';
    const templateName = path.basename(mail.data.template, path.extname(mail.data.template));
    const templatePath = path.join(get(mailerOptions, 'template.dir', ''), templateName + templateExt);

    if (!this.precompiledTemplates[templateName]) {
      try {
        const template = fs.readFileSync(templatePath, 'UTF-8');

        this.precompiledTemplates[templateName] = handlebars.compile(template, get(mailerOptions, 'template.options', {}));
      } catch (err) {
        return callback(err);
      }
    }

    mail.data.html = this.precompiledTemplates[templateName](mail.data.context);

    return callback();
  }
}
