/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { inline } from '@css-inline/css-inline';
import * as glob from 'glob';
import * as handlebars from 'handlebars';
import { HelperDeclareSpec } from 'handlebars';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';

export class HandlebarsAdapter implements TemplateAdapter {
  private precompiledTemplates: {
    [name: string]: handlebars.TemplateDelegate;
  } = {};

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
      const templateBaseDir = get(options, 'dir', '');
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
      const partialPath = path
        .join(runtimeOptions.partials.dir, '**', '*.hbs')
        .replace(/\\/g, '/');

      const files = glob.sync(partialPath);

      files.forEach((file) => {
        const { templateName, templatePath } = precompile(
          file,
          () => {},
          runtimeOptions.partials,
        );
        const templateDir = path.relative(
          runtimeOptions.partials.dir,
          path.dirname(templatePath),
        );
        handlebars.registerPartial(
          path.join(templateDir, templateName),
          fs.readFileSync(templatePath, 'utf-8'),
        );
      });
    }

    // Feature 11: Handlebars default layout support
    const layoutName = get(mailerOptions, 'options.layout', null);
    let rendered = this.precompiledTemplates[templateName](mail.data.context, {
      ...runtimeOptions,
      partials: this.precompiledTemplates,
    });

    if (layoutName) {
      const layoutDir = get(mailerOptions, 'template.dir', '');
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
    rendered = this.resolveExternalCss(rendered, mailerOptions);

    if (this.config.inlineCssEnabled) {
      try {
        mail.data.html = inline(rendered, this.config.inlineCssOptions);
      } catch (e) {
        callback(e);
      }
    } else {
      mail.data.html = rendered;
    }
    return callback();
  }

  /**
   * Feature 16: Replace <link rel="stylesheet" href="..."> with inline <style> blocks
   * when the href points to a local file relative to the template directory.
   */
  private resolveExternalCss(
    html: string,
    mailerOptions: MailerOptions,
  ): string {
    const baseDir =
      this.config.cssBaseUrl || get(mailerOptions, 'template.dir', '');

    if (!baseDir) return html;

    return html.replace(
      /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
      (match, href) => {
        // Skip remote URLs
        if (
          href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('//')
        ) {
          return match;
        }

        const cssPath = path.resolve(baseDir, href);
        try {
          const cssContent = fs.readFileSync(cssPath, 'utf-8');
          return `<style>${cssContent}</style>`;
        } catch {
          // File not found, keep the original <link> tag
          return match;
        }
      },
    );
  }
}
