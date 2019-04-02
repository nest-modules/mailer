/** Dependencies **/
import * as SMTPTransport from 'nodemailer/lib/smtp-transport';
import { DynamicModule, Type } from '@nestjs/common';
import { SendMailOptions, SentMessageInfo } from 'nodemailer';

declare class MailerModule {
  public static forRoot(config?: MailerOptions): DynamicModule;

  public static forRootAsync(config?: MailerAsyncOptions): DynamicModule;
}

declare class MailerService {
  public sendMail(sendMailOptions: ISendMailOptions): Promise<SentMessageInfo>;
}

declare interface TemplateAdapter {
  compile(mail: any, callback: (err?: any, body?: string) => any, options: MailerOptions): void;
}

declare interface MailerOptionsFactory {
  createMailerOptions(): Promise<MailerOptions> | MailerOptions;
}

declare interface MailerOptions {
  defaults?: SMTPTransport.Options;
  transport?: SMTPTransport | SMTPTransport.Options | string;
  template?: {
    dir?: string;
    adapter?: TemplateAdapter;
    options?: { [name: string]: any; };
  };
}

declare interface MailerAsyncOptions {
  inject?: any[];
  useClass?: Type<MailerOptionsFactory>;
  useExisting?: Type<MailerOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<MailerOptions> | MailerOptions;
}

declare interface ISendMailOptions extends SendMailOptions  {
  template?: string,
  context?: { [name: string]: any; }
}