/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inline } from '@css-inline/css-inline';
import {
  AsyncTemplateFunction,
  ClientFunction,
  compile,
  TemplateFunction,
} from 'ejs';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
import { resolveExternalCss } from '../utils/resolve-external-css';

export class EjsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: TemplateFunction | AsyncTemplateFunction | ClientFunction;
  } = Object.create(null);

  private config: TemplateAdapterConfig = {
    inlineCssOptions: {},
    inlineCssEnabled: true,
  };

  constructor(config?: TemplateAdapterConfig) {
    Object.assign(this.config, config);
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const { context, template } = mail.data;
    const templateBaseDir = mailerOptions.template?.dir ?? '';
    const templateExt = path.extname(template) || '.ejs';
    let templateName = path.basename(template, path.extname(template));
    const templateDir = path.isAbsolute(template)
      ? path.dirname(template)
      : path.join(templateBaseDir, path.dirname(template));
    let templatePath = path.join(templateDir, templateName + templateExt);
    templateName = path
      .relative(templateBaseDir, templatePath)
      .replace(templateExt, '');

    // Feature 10: Search in additional template directories
    if (!fs.existsSync(templatePath) && mailerOptions.template?.dirs) {
      for (const dir of mailerOptions.template.dirs) {
        const altPath = path.join(
          dir,
          path.dirname(template),
          path.basename(template, path.extname(template)) + templateExt,
        );
        if (fs.existsSync(altPath)) {
          templatePath = altPath;
          break;
        }
      }
    }

    if (!this.precompiledTemplates[templateName]) {
      try {
        const template = fs.readFileSync(templatePath, 'utf-8');

        this.precompiledTemplates[templateName] = compile(template, {
          ...mailerOptions.template?.options,
          filename: templatePath,
        });
      } catch (err) {
        return callback(err);
      }
    }

    let rendered: ReturnType<TemplateFunction | AsyncTemplateFunction>;
    try {
      rendered = this.precompiledTemplates[templateName](context);
    } catch (err) {
      return callback(err);
    }

    const render = (html: string) => {
      // Feature 16: Resolve external CSS <link> tags
      html = resolveExternalCss(
        html,
        this.config.cssBaseUrl || (mailerOptions.template?.dir ?? ''),
      );

      if (this.config.inlineCssEnabled) {
        try {
          mail.data.html = inline(html, this.config.inlineCssOptions);
        } catch (e) {
          return callback(e);
        }
      } else {
        mail.data.html = html;
      }
      return callback();
    };

    if (typeof rendered === 'string') {
      render(rendered);
    } else {
      rendered.then(render, callback);
    }
  }
}
