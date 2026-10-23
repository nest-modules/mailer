import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';

/** Runs a template adapter outside nodemailer: renders `data.template` into `data.html` */
export function compileTemplate(
  adapter: TemplateAdapter,
  data: Record<string, any>,
  options: MailerOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      adapter.compile(
        { data },
        (error?: unknown) => (error ? reject(error) : resolve()),
        options,
      );
    } catch (error) {
      reject(error);
    }
  });
}
