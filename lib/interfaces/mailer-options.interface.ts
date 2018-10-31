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
  inlineCSS?: InlineCSSOptions;
  engineConfig?: {
    [optionName: string]: string
  }
  precompiledTemplates?: {
    [templateName: string]: (context: any) => any;
  };
}

export interface InlineCSSOptions {
  enabled?: boolean;
  options?: {
    [optionName: string]: string
  }
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