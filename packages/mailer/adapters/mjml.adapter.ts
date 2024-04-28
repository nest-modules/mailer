/** Dependencies **/
import { HandlebarsAdapter } from './handlebars.adapter';
import { EjsAdapter } from './ejs.adapter';
import { TemplateAdapterConfig } from '../interfaces/template-adapter-config.interface';
import { PugAdapter } from './pug.adapter';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import * as mjml2html from 'mjml';

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

    if (typeof engine == 'string') {
      if (engine === 'pug') {
        this.engine = new PugAdapter(config);
      } else if (engine === 'handlebars') {
        this.engine = new HandlebarsAdapter(others.handlebar.helper, config);
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
      () => {
        mail.data.html = mjml2html(mail.data.html).html;
        callback();
      },
      mailerOptions,
    );
  }
}
