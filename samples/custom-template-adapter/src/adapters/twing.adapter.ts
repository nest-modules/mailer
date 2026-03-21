import * as fs from 'node:fs';
import * as path from 'node:path';
import { MailerOptions, TemplateAdapter } from '@nestjs-modules/mailer';
import {
  createEnvironment,
  createFilesystemLoader,
  type TwingEnvironment,
} from 'twing';

export class TwingAdapter implements TemplateAdapter {
  private environments: Map<string, TwingEnvironment> = new Map();

  compile(
    mail: any,
    callback: (err?: any, body?: string) => any,
    options: MailerOptions,
  ): void {
    const templateExt = path.extname(mail.data.template) || '.twig';
    const templateName = path.basename(mail.data.template, templateExt);
    const templateDir =
      options.template?.dir ?? path.dirname(mail.data.template);

    if (!this.environments.has(templateDir)) {
      const loader = createFilesystemLoader(fs);
      loader.addPath(templateDir);
      const env = createEnvironment(loader);
      this.environments.set(templateDir, env);
    }

    const env = this.environments.get(templateDir)!;

    env
      .render(templateName + templateExt, mail.data.context || {})
      .then((html) => {
        mail.data.html = html;
        return callback();
      })
      .catch(callback);
  }
}
