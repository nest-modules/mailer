/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inline } from '@css-inline/css-inline';
import * as glob from 'glob';
import * as handlebars from 'handlebars';
import { HelperDeclareSpec } from 'handlebars';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
import { resolveExternalCss } from '../utils/resolve-external-css';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: handlebars.TemplateDelegate;
  } = Object.create(null);

  private config: TemplateAdapterConfig = {
    inlineCssOptions: {},
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
      const templateBaseDir = options?.dir ?? '';
      const templateExt = path.extname(template) || '.hbs';
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

          this.precompiledTemplates[templateName] = handlebars.compile(
            template,
            options?.options ?? {},
          );
        } catch (err) {
          callback(err);
          return null;
        }
      }

      return {
        templateExt,
        templateName,
        templateDir,
        templatePath,
      };
    };

    const precompiled = precompile(
      mail.data.template,
      callback,
      mailerOptions.template,
    );
    if (!precompiled) return;
    const { templateName } = precompiled;

    const runtimeOptions = mailerOptions.options ?? {
      partials: false,
      data: {},
    };

    if (runtimeOptions.partials) {
      const partialPath = path
        .join(runtimeOptions.partials.dir, '**', '*.hbs')
        .replace(/\\/g, '/');

      const files = glob.sync(partialPath);

      for (const file of files) {
        const partial = precompile(file, () => {}, runtimeOptions.partials);
        // Skip partials that cannot be read (e.g. a directory named *.hbs)
        if (!partial) continue;
        const { templateName, templatePath } = partial;
        const templateDir = path.relative(
          runtimeOptions.partials.dir,
          path.dirname(templatePath),
        );
        handlebars.registerPartial(
          path.join(templateDir, templateName),
          fs.readFileSync(templatePath, 'utf-8'),
        );
      }
    }

    // Feature 11: Handlebars default layout support
    const layoutName = mailerOptions.options?.layout ?? null;
    let rendered: string;
    try {
      rendered = this.precompiledTemplates[templateName](mail.data.context, {
        ...runtimeOptions,
        partials: this.precompiledTemplates,
      });
    } catch (err) {
      return callback(err);
    }

    if (layoutName) {
      const layoutDir = mailerOptions.template?.dir ?? '';
      const layoutExt = '.hbs';
      const layoutPath = path.join(layoutDir, layoutName + layoutExt);

      if (!this.precompiledTemplates[`__layout_${layoutName}`]) {
        try {
          const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
          this.precompiledTemplates[`__layout_${layoutName}`] =
            handlebars.compile(layoutContent);
        } catch {
          // Layout not found, skip
        }
      }

      const layoutTemplate =
        this.precompiledTemplates[`__layout_${layoutName}`];
      if (layoutTemplate) {
        rendered = layoutTemplate({
          ...mail.data.context,
          body: new handlebars.SafeString(rendered),
        });
      }
    }

    // Feature 16: Resolve external CSS <link> tags from local files
    rendered = resolveExternalCss(
      rendered,
      this.config.cssBaseUrl || (mailerOptions.template?.dir ?? ''),
    );

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
