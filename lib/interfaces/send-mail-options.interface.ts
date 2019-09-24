import { SendMailOptions as BaseMailOptions } from 'nodemailer';

export interface SendMailOptions extends BaseMailOptions {
  template?: string;
  context?: { [name: string]: any };
}

/* @deprecated defined to maintain compatibility with v1.1.{2,3}, use SendMailOptions instead  */
export type ISendMailOptions = SendMailOptions;
