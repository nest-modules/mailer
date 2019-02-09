/** Dependencies **/
import * as path from 'path';
import { get } from 'lodash';
import { renderFile } from 'pug';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

export class PugAdapter implements TemplateAdapter {
  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const templateExt = path.extname(mail.data.template) || '.pug';
    const templateName = path.basename(mail.data.template, path.extname(mail.data.template));
    const templatePath = path.join(get(mailerOptions, 'template.dir', ''), templateName + templateExt);

    const options = {
      ...mail.data.context,
      ...get(mailerOptions, 'template.options', {}),
    };

    renderFile(templatePath, options, (err, body) => {
      if (err) {
        return callback(err);
      }

      mail.data.html = body;

      return callback();
    });
  }
}
