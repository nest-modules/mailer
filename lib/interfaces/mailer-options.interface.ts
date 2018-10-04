import { ModuleMetadata, Type } from '@nestjs/common/interfaces';

export interface MailerModuleOptions {
  transport?: any;
  defaults?: any;
  templateDir?: string;
  templateOptions?: TemplateEngineOptions;
}

export interface TemplateEngineOptions {
  engine?: string;
  engineAdapter?: Function;
  precompiledTemplates?: {
    [templateName: string]: (context: any) => any;
  };
}

export interface MailerOptionsFactory {
  createMailerOptions(): Promise<MailerModuleOptions> | MailerModuleOptions;
}

export interface MailerModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<MailerOptionsFactory>;
  useClass?: Type<MailerOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<MailerModuleOptions> | MailerModuleOptions;
  inject?: any[];
}

export type RenderCallback = (err?: any, body?: string) => any;