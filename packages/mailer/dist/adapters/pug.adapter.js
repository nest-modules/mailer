"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PugAdapter = void 0;
const tslib_1 = require("tslib");
const path = tslib_1.__importStar(require("node:path"));
const css_inline_1 = require("@css-inline/css-inline");
const lodash_1 = require("lodash");
const pug_1 = require("pug");
class PugAdapter {
    constructor(config) {
        this.config = {
            inlineCssOptions: {},
            inlineCssEnabled: true,
        };
        Object.assign(this.config, config);
    }
    compile(mail, callback, mailerOptions) {
        const { context, template } = mail.data;
        const templateExt = path.extname(template) || '.pug';
        const templateName = path.basename(template, path.extname(template));
        const templateDir = path.isAbsolute(template)
            ? path.dirname(template)
            : path.join((0, lodash_1.get)(mailerOptions, 'template.dir', ''), path.dirname(template));
        const templatePath = path.join(templateDir, templateName + templateExt);
        const options = Object.assign(Object.assign({}, context), (0, lodash_1.get)(mailerOptions, 'template.options', {}));
        (0, pug_1.renderFile)(templatePath, options, (err, body) => {
            if (err) {
                return callback(err);
            }
            if (this.config.inlineCssEnabled) {
                try {
                    mail.data.html = (0, css_inline_1.inline)(body, this.config.inlineCssOptions);
                }
                catch (e) {
                    callback(e);
                }
            }
            else {
                mail.data.html = body;
            }
            return callback();
        });
    }
}
exports.PugAdapter = PugAdapter;
