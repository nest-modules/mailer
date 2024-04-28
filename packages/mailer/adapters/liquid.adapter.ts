/** Dependencies **/
import * as path from 'path';
import { get } from 'lodash';

/** Interfaces **/
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { TemplateAdapter } from '../interfaces/template-adapter.interface';
import { Liquid } from 'liquidjs';

export class LiquidAdapter implements TemplateAdapter {
	private config: Partial<Liquid['options']>;

	constructor(config?: Partial<Liquid['options']>) {
		Object.assign(this.config, config);
	}

	public compile(mail: any, callback: any, mailerOptions: MailerOptions): void {
		const { context, template } = mail.data;

		const templateExt = path.extname(template) || '.liquid';
		const templateName = path.basename(template, path.extname(template));
		const templateDir = path.isAbsolute(template)
			? path.dirname(template)
			: path.join(get(mailerOptions, 'template.dir', ''), path.dirname(template));

		const engine = new Liquid({
			extname: templateExt,
			root: templateDir,
			...this.config.globals
		});

		engine.renderFile(templateName, context).then((body) => {
			mail.data.html = body;
			return callback();
		}).catch((err) => {
			return callback(err);
		});
	}
}
