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

export type RenderCallback = (err?: any, body?: string) => any;