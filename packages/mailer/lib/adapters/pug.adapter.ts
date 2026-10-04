/** Dependencies **/

import * as path from 'node:path';
import { compileFile } from 'pug';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
import { inlineCss } from '../utils/inline-css';

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
      : path.join(mailerOptions.template?.dir ?? '', path.dirname(template));
    const templatePath = path.join(templateDir, templateName + templateExt);

    // Template data is kept out of the compiler options so values such as
    // `filename`, `basedir`, `filters` or `plugins` in the context cannot
    // change how pug compiles the template.
    const options = mailerOptions.template?.options;
    let body: string;
    try {
      body = compileFile(templatePath, options)({ ...context, ...options });
    } catch (err) {
      return callback(err);
    }

    if (this.config.inlineCssEnabled) {
      try {
        mail.data.html = inlineCss(body, this.config.inlineCssOptions);
      } catch (e) {
        return callback(e);
      }
    } else {
      mail.data.html = body;
    }
    return callback();
  }
}
