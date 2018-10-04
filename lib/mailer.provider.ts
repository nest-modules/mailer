/** Dependencies **/
import * as path from 'path';
import { renderFile } from 'pug';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import { Injectable, Inject } from '@nestjs/common';
import { 
  createTransport,
  SentMessageInfo,
  Transporter,
  SendMailOptions 
} from 'nodemailer';
import { 
  MailerModuleOptions,
  TemplateEngineOptions,
  RenderCallback
} from './interfaces'

@Injectable()
export class MailerProvider {
  private transporter: Transporter;
  private precompiledTemplates: any;

  constructor(
    @Inject('MAILER_MODULE_OPTIONS') 
    private readonly options: MailerModuleOptions
  ) {
    if (!options.transport || Object.keys(options.transport).length < 1) {
      throw new Error('Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance');
    }
    this.setupTransporter(options.transport, options.defaults, options.templateDir, options.templateOptions);
  }

  private setupTransporter(transport: any, defaults?: any, templateDir?: string, templateOptions: TemplateEngineOptions = { engine: 'pug' }): void {
    this.transporter = createTransport(transport, defaults);
    this.precompiledTemplates = templateOptions.precompiledTemplates || {};

    if (templateOptions && typeof templateOptions.engineAdapter === 'function') {
      this.transporter.use('compile', this.renderTemplateWithAdapter(templateDir, templateOptions.engineAdapter));
    } else if (templateOptions.engine) {
      const engine = templateOptions.engine.toLowerCase();
      let adapter: (templateDir: string, mail: any, callback: RenderCallback) => any;

      if (engine === 'handlebars') {
        adapter = this.handlebarsAdapter.bind(this);
      } else if (engine === 'pug') {
        adapter = this.pugAdapter.bind(this);
      } else {
        throw new Error(`Unsuported template engine: ${engine}`);
      }

      this.transporter.use('compile', this.renderTemplateWithAdapter(templateDir, adapter));
    } else {
      throw new Error('Invalid template engine options: could not find engine or adapter');
    }
  }

  public async sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo> {
    return await this.transporter.sendMail(sendMailOptions);
  }

  private getTemplatePath(templateDir: string, templateName?: string, extension?: string) {
    return path.join(process.cwd(), templateDir || './public/templates', templateName) + extension;
  }

  private renderTemplateWithAdapter(templateDir: string, templateAdapter: any) {
    return (mail, callback) => {
      if (mail.data.html) {
        return callback();
      }
      templateAdapter(templateDir, mail, callback);
    };
  }

  private pugAdapter(templateDir: string, mail: any, callback: RenderCallback) {
    const templatePath = this.getTemplatePath(templateDir, mail.data.template, '.pug');
    renderFile(templatePath, mail.data.context, (err, body) => {
      if (err) {
        return callback(err);
      }
      mail.data.html = body;
      return callback();
    });
  }

  private handlebarsAdapter(templateDir: string, mail: any, callback: RenderCallback) {
    const templatePath = this.getTemplatePath(templateDir, mail.data.template, '.hbs');
    const templateName = path.basename(mail.data.template, path.extname(mail.data.template));

    if (!this.precompiledTemplates[templateName]) {
      try {
        const templateString = fs.readFileSync(templatePath, 'UTF-8');
        this.precompiledTemplates[templateName] = Handlebars.compile(templateString);
      } catch (err) {
        return callback(err);
      }
    }
    mail.data.html = this.precompiledTemplates[templateName](mail.data.context);
    return callback();
  }
}