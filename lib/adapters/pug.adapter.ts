/** Dependencies **/
import * as path from 'path';
import { get } from 'lodash';
import { renderFile } from 'pug';
import * as inlineCss from 'inline-css';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class PugAdapter implements TemplateAdapter {
  private config: TemplateAdapterConfig = {
    inlineCssOptions: { url: ' ' },
    inlineCssEnabled: true,
  };

  constructor(config?: TemplateAdapterConfig) {
    Object.assign(this.config, config);
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const templateExt = path.extname(mail.data.template) || '.pug';
    const templateName = path.basename(
      mail.data.template,
      path.extname(mail.data.template),
    );
    const templateDir =
      mail.data.template.startsWith('./')
        ? get(mailerOptions, 'template.dir', '')
        : path.dirname(mail.data.template);
    const templatePath = path.join(templateDir, templateName + templateExt);

    const options = {
      ...mail.data.context,
      ...get(mailerOptions, 'template.options', {}),
    };

    renderFile(templatePath, options, (err, body) => {
      if (err) {
        return callback(err);
      }

      if (this.config.inlineCssEnabled) {
        inlineCss(body, this.config.inlineCssOptions).then((html) => {
          mail.data.html = html;
          return callback();
        });
      } else {
        mail.data.html = body;
        return callback();
      }
    });
  }
}
