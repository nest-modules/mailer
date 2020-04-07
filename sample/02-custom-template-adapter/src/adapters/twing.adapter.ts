import { MailerOptions, TemplateAdapter } from '@nestjs-modules/mailer';
import * as inlineCSS from 'inline-css';
import * as path from 'path';
import { TwingEnvironment, TwingLoaderFilesystem, TwingTemplate } from 'twing';

export class TwingAdapter implements TemplateAdapter {
  private precompiledTemplates: Map<string, TwingTemplate> = new Map();

  compile(
    mail: any,
    callback: (err?: any, body?: string) => any,
    options: MailerOptions,
  ): void {
    const templateExt = path.extname(mail.data.template) || '.twig';
    const templateName = path.basename(mail.data.template, templateExt);
    const templateDir =
      options.template?.dir ?? path.dirname(mail.data.template);
    const loader = new TwingLoaderFilesystem(templateDir);
    const twing = new TwingEnvironment(loader);

    this.renderTemplate(twing, templateName + templateExt, mail.data.context)
      .then((html) => {
        mail.data.html = html;

        return callback();
      })
      .catch(callback);
  }

  private async renderTemplate(
    twing: TwingEnvironment,
    template: string,
    context: Record<string, any>,
  ): Promise<string> {
    if (!this.precompiledTemplates.has(template))
      this.precompiledTemplates.set(template, await twing.load(template));

    const rendered = await this.precompiledTemplates
      .get(template)
      .render(context);

    return inlineCSS(rendered, { url: ' ' });
  }
}
