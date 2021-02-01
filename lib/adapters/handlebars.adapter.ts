/** Dependencies **/
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as inlineCss from 'inline-css';
import * as glob from 'glob';
import { get } from 'lodash';
import { HelperDeclareSpec } from 'handlebars';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: handlebars.TemplateDelegate;
  } = {};

  private config: TemplateAdapterConfig = {
    inlineCssOptions: { url: ' ' },
    inlineCssEnabled: true,
  };

  constructor(helpers?: HelperDeclareSpec, config?: TemplateAdapterConfig) {
    handlebars.registerHelper('concat', (...args) => {
      args.pop();
      return args.join('');
    });
    handlebars.registerHelper(helpers || {});
    Object.assign(this.config, config);
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    const precompile = (template: any, callback: any, options: any) => {
      const templateExt = path.extname(template) || '.hbs';
      const templateName = path.basename(template, path.extname(template));
      const templateDir =
        template.startsWith('./')
          ? get(options, 'dir', '')
          : path.dirname(template);
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

    const { templateName } = precompile(
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

    if (this.config.inlineCssEnabled) {
      inlineCss(rendered, this.config.inlineCssOptions).then((html) => {
        mail.data.html = html;
        return callback();
      });
    } else {
      mail.data.html = rendered;
      return callback();
    }
  }
}
