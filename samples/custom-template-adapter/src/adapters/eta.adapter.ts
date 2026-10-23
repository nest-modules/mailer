import * as path from 'node:path';
import { MailerOptions, TemplateAdapter } from '@nestjs-modules/mailer';
import { Eta } from 'eta';

/**
 * A custom template adapter: any engine can render emails by implementing
 * `TemplateAdapter#compile`, which sets `mail.data.html` and calls `callback`.
 */
export class EtaAdapter implements TemplateAdapter {
  private readonly engines = new Map<string, Eta>();

  compile(
    mail: any,
    callback: (err?: any, body?: string) => any,
    options: MailerOptions,
  ): void {
    const templateExt = path.extname(mail.data.template) || '.eta';
    const templateName = path.basename(mail.data.template, templateExt);
    const templateDir =
      options.template?.dir ?? path.dirname(mail.data.template);

    let eta = this.engines.get(templateDir);
    if (!eta) {
      // `autoEscape` escapes every `<%= %>` value; `<%~ %>` inserts raw HTML
      eta = new Eta({ views: templateDir, autoEscape: true, cache: true });
      this.engines.set(templateDir, eta);
    }

    eta
      .renderAsync(templateName + templateExt, mail.data.context || {})
      .then((html) => {
        mail.data.html = html;
        return callback();
      })
      .catch(callback);
  }
}
