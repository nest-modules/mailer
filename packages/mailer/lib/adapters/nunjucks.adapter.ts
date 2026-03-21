/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inline } from '@css-inline/css-inline';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class NunjucksAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: (context: any) => string;
  } = {};

  private config: TemplateAdapterConfig = {
    inlineCssOptions: {},
    inlineCssEnabled: true,
  };

  constructor(config?: TemplateAdapterConfig) {
    Object.assign(this.config, config);
  }

  public compile(
    mail: any,
    callback: any,
    mailerOptions: MailerOptions,
  ): void {
    const { context, template } = mail.data;
    const templateBaseDir = get(mailerOptions, 'template.dir', '');
    const templateExt = path.extname(template) || '.njk';
    let templateName = path.basename(template, path.extname(template));
    const templateDir = path.isAbsolute(template)
      ? path.dirname(template)
      : path.join(templateBaseDir, path.dirname(template));
    const templatePath = path.join(templateDir, templateName + templateExt);
    templateName = path
      .relative(templateBaseDir, templatePath)
      .replace(templateExt, '');

    if (!this.precompiledTemplates[templateName]) {
      try {
        let nunjucks: any;
        try {
          nunjucks = require('nunjucks');
        } catch {
          return callback(
            new Error(
              'nunjucks is not installed. Install it with: npm install nunjucks',
            ),
          );
        }

        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const env = nunjucks.configure(templateDir, {
          autoescape: true,
          ...get(mailerOptions, 'template.options', {}),
        });

        const compiled = nunjucks.compile(templateContent, env);
        this.precompiledTemplates[templateName] = (ctx: any) =>
          compiled.render(ctx);
      } catch (err) {
        return callback(err);
      }
    }

    const rendered = this.precompiledTemplates[templateName](context);

    if (this.config.inlineCssEnabled) {
      try {
        mail.data.html = inline(rendered, this.config.inlineCssOptions);
      } catch (e) {
        return callback(e);
      }
    } else {
      mail.data.html = rendered;
    }
    return callback();
  }
}
