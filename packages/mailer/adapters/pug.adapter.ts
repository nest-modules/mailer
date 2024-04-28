/** Dependencies **/
import * as path from 'path';
import { get } from 'lodash';
import { renderFile } from 'pug';
import { inline } from '@css-inline/css-inline';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class PugAdapter implements TemplateAdapter {
  private config: TemplateAdapterConfig = {
    inlineCssOptions: {},
    inlineCssEnabled: true,
  };

  constructor(config?: TemplateAdapterConfig) {
    Object.assign(this.config, config);
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const { context, template } = mail.data;
    const templateExt = path.extname(template) || '.pug';
    const templateName = path.basename(template, path.extname(template));
    const templateDir = path.isAbsolute(template)
      ? path.dirname(template)
      : path.join(
          get(mailerOptions, 'template.dir', ''),
          path.dirname(template),
        );
    const templatePath = path.join(templateDir, templateName + templateExt);

    const options = {
      ...context,
      ...get(mailerOptions, 'template.options', {}),
    };

    renderFile(templatePath, options, (err, body) => {
      if (err) {
        return callback(err);
      }

      if (this.config.inlineCssEnabled) {
        try {
          mail.data.html = inline(body, this.config.inlineCssOptions);
        } catch (e) {
          callback(e);
        }
      } else {
        mail.data.html = body;
      }
      return callback();
    });
  }
}
