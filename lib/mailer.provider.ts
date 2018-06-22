/** Dependencies **/
import { join } from 'path';
import { renderFile } from 'pug';
import * as Handlebars  from 'handlebars';
import * as fs from 'fs';
import { Component, Inject } from '@nestjs/common';
import { createTransport, SentMessageInfo, Transporter, SendMailOptions } from 'nodemailer';

@Component()
export class MailerProvider {

  private transporter: Transporter;

  constructor(@Inject('MAILER_CONFIG') private readonly mailerConfig: { transport?: any, defaults?: any, templateDir?: string, templateEngine?:string }) {
    if ((!mailerConfig.transport) || (Object.keys(mailerConfig.transport).length < 1)) {
      throw new Error('Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance')
    }

    this.setupTransporter(mailerConfig.transport, mailerConfig.defaults, mailerConfig.templateDir, mailerConfig.templateEngine);
  }

  private setupTransporter(transport: any, defaults?: any, templateDir?: string,templateEngine?:string): void {
    this.transporter = createTransport(transport, defaults);
    if (templateEngine === 'HANDLEBARS') {
      this.transporter.use('compile', this.renderTemplateWithHandlebars(templateDir));
    } else {
      this.transporter.use('compile', this.renderTemplateWithPug(templateDir));
    }
  }

  public async sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo> {
    return await this.transporter.sendMail(sendMailOptions);
  }

  private getTemplatePath(templateDir:string,templateName?:string){
    return join(process.cwd(), templateDir || './public/templates', templateName );
  }

  private renderTemplateWithPug(templateDir)  {
    return (mail, callback) => {
      if (mail.data.html) {
        return callback();
      }
      let templatePath = this.getTemplatePath(templateDir, mail.data.template) + '.pug';    
      renderFile(templatePath, mail.data.context, (err, body) => {
        if (err) {
          return callback(err);
        }

        mail.data.html = body;

        return callback();
      });
    }
  }
  private renderTemplateWithHandlebars(templateDir) {
    return (mail, callback) => {
      if (mail.data.html) {
        return callback();
      }
      let templatePath = this.getTemplatePath(templateDir, mail.data.template) + '.hbs';    

      fs.readFile(templatePath,'utf8',(err,data)=>{
        if (err){
          return callback(err);
        }
        var template = Handlebars.compile(data);
        mail.data.html = template(mail.data.context);  
        return callback();
      });
    }
  }

}