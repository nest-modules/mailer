/** Dependencies **/
import { DynamicModule } from '@nestjs/common';
import { SendMailOptions, SentMessageInfo } from 'nodemailer';

declare class MailerModule {
  static forRoot(config?: any): DynamicModule;
}

declare class MailerProvider {
  public sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo>;
}

declare interface MailerConfig {
  transport?: any;
  defaults?: any;
  templateDir?: string;
  templateOptions?: TemplateEngineOptions;
}

declare interface TemplateEngineOptions {
  engine?: string;
  engineAdapter?: Function;
  precompiledTemplates?: {
    [templateName: string]: (context: any) => any;
  };
}

declare type RenderCallback = (err?: any, body?: string) => any;
