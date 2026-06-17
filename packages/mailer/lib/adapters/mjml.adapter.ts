/** Dependencies **/

import mjml2html from 'mjml';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
import { EjsAdapter } from './ejs.adapter';
import { HandlebarsAdapter } from './handlebars.adapter';
import { PugAdapter } from './pug.adapter';

export class MjmlAdapter implements TemplateAdapter {
  private engine: TemplateAdapter | null;

  constructor(
    engine: TemplateAdapter | '' | 'pug' | 'handlebars' | 'ejs',
    config?: TemplateAdapterConfig,
    others?: {
      handlebar?: {
        helper?: any;
      };
    },
  ) {
    this.engine = engine as TemplateAdapter;

    if (typeof engine === 'string') {
      if (engine === 'pug') {
        this.engine = new PugAdapter(config);
      } else if (engine === 'handlebars') {
        this.engine = new HandlebarsAdapter(others?.handlebar?.helper, config);
      } else if (engine === 'ejs') {
        this.engine = new EjsAdapter(config);
      } else if (engine === '') {
        engine = null;
      }
    }
  }

  public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
    this?.engine?.compile(
      mail,
      (err?: any) => {
        if (err) {
          callback(err);
          return;
        }

        // mjml v5+ returns a Promise from mjml2html, while v4 returns the
        // result synchronously. Promise.resolve handles both transparently.
        Promise.resolve(mjml2html(mail.data.html))
          .then((result) => {
            mail.data.html = result.html;
            callback();
          })
          .catch((error) => callback(error));
      },
      mailerOptions,
    );
  }
}
