import * as fs from 'node:fs';
import * as path from 'node:path';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { compileTemplate } from '../utils/compile-template';
import {
  localizedCandidates,
  TEMPLATE_EXTENSIONS,
} from '../utils/localized-template';
import type {
  MailTemplateEngineLike,
  MailTemplateOutputLike,
  MailTemplateRenderOptionsLike,
} from './nestjs-mail.types';

export interface TemplateAdapterEngineOptions {
  /** One of this library's adapters: Handlebars, Pug, EJS, MJML, Liquid, Nunjucks */
  adapter: TemplateAdapter;
  /** The templates directory */
  dir: string;
  /** More directories to search */
  dirs?: string[];
  /** Compile options for the engine (`MailerOptions.template.options`) */
  templateOptions?: Record<string, any>;
  /** Runtime options such as Handlebars `partials` and `layout` (`MailerOptions.options`) */
  options?: Record<string, any>;
}

/**
 * A `@nestjs/mail` template engine backed by this library's adapters, bringing
 * Handlebars (helpers, partials, layouts), Pug, EJS, MJML, Liquid and Nunjucks,
 * plus CSS inlining, to `@nestjs/mail`.
 *
 * Locales follow both conventions: `es/welcome` and `welcome.es`, falling back
 * from a region to its language and then to the unlocalized template.
 *
 * @example
 * ```typescript
 * MailModule.forRoot({
 *   transport,
 *   templates: new TemplateAdapterEngine({
 *     adapter: new HandlebarsAdapter(),
 *     dir: join(__dirname, 'templates'),
 *   }),
 * })
 * ```
 */
export class TemplateAdapterEngine implements MailTemplateEngineLike {
  private readonly mailerOptions: MailerOptions;
  private readonly dirs: string[];

  constructor(private readonly config: TemplateAdapterEngineOptions) {
    this.dirs = [config.dir, ...(config.dirs ?? [])];
    this.mailerOptions = {
      template: {
        dir: config.dir,
        dirs: config.dirs,
        adapter: config.adapter,
        options: config.templateOptions,
      },
      options: config.options,
    };
  }

  async render(
    name: string,
    context: object,
    options: MailTemplateRenderOptionsLike,
  ): Promise<MailTemplateOutputLike> {
    const template = this.resolve(name, options.locale);
    const data: Record<string, any> = {
      template,
      context,
      locale: options.locale,
    };
    try {
      await compileTemplate(this.config.adapter, data, this.mailerOptions);
    } catch (error) {
      // A missing or broken template is never fixed by retrying
      if (error && typeof error === 'object') {
        Object.defineProperty(error, 'permanent', {
          value: true,
          enumerable: true,
        });
      }
      throw error;
    }
    return String(data.html ?? '');
  }

  private resolve(name: string, locale: string | undefined): string {
    if (!locale) return name;
    for (const candidate of localizedCandidates(name, locale)) {
      const ext = this.extensionOf(candidate);
      // With its extension: adapters would read `.es` in `welcome.es` as one
      if (ext) return candidate + ext;
    }
    return name;
  }

  /** The extension of the file `name` names in one of the directories, if any */
  private extensionOf(name: string): string | undefined {
    for (const dir of this.dirs) {
      const base = path.join(dir, name);
      const ext = TEMPLATE_EXTENSIONS.find((e) => fs.existsSync(base + e));
      if (ext) return ext;
    }
    return undefined;
  }
}
