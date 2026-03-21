"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EjsAdapter = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("node:fs"));
const path = tslib_1.__importStar(require("node:path"));
const css_inline_1 = require("@css-inline/css-inline");
const ejs_1 = require("ejs");
const lodash_1 = require("lodash");
class EjsAdapter {
    constructor(config) {
        this.precompiledTemplates = {};
        this.config = {
            inlineCssOptions: {},
            inlineCssEnabled: true,
        };
        Object.assign(this.config, config);
    }
    compile(mail, callback, mailerOptions) {
        var _a;
        const { context, template } = mail.data;
        const templateBaseDir = (0, lodash_1.get)(mailerOptions, 'template.dir', '');
        const templateExt = path.extname(template) || '.ejs';
        let templateName = path.basename(template, path.extname(template));
        const templateDir = path.isAbsolute(template)
            ? path.dirname(template)
            : path.join(templateBaseDir, path.dirname(template));
        let templatePath = path.join(templateDir, templateName + templateExt);
        templateName = path
            .relative(templateBaseDir, templatePath)
            .replace(templateExt, '');
        if (!fs.existsSync(templatePath) && ((_a = mailerOptions.template) === null || _a === void 0 ? void 0 : _a.dirs)) {
            for (const dir of mailerOptions.template.dirs) {
                const altPath = path.join(dir, path.dirname(template), path.basename(template, path.extname(template)) + templateExt);
                if (fs.existsSync(altPath)) {
                    templatePath = path.join(dir, path.dirname(template), templateName + templateExt);
                    break;
                }
            }
        }
        if (!this.precompiledTemplates[templateName]) {
            try {
                const template = fs.readFileSync(templatePath, 'utf-8');
                this.precompiledTemplates[templateName] = (0, ejs_1.compile)(template, Object.assign(Object.assign({}, (0, lodash_1.get)(mailerOptions, 'template.options', {})), { filename: templatePath }));
            }
            catch (err) {
                return callback(err);
            }
        }
        const rendered = this.precompiledTemplates[templateName](context);
        const render = (html) => {
            html = this.resolveExternalCss(html, mailerOptions);
            if (this.config.inlineCssEnabled) {
                try {
                    mail.data.html = (0, css_inline_1.inline)(html, this.config.inlineCssOptions);
                }
                catch (e) {
                    callback(e);
                }
            }
            else {
                mail.data.html = html;
            }
            return callback();
        };
        if (typeof rendered === 'string') {
            render(rendered);
        }
        else {
            rendered.then(render);
        }
    }
    resolveExternalCss(html, mailerOptions) {
        const baseDir = this.config.cssBaseUrl || (0, lodash_1.get)(mailerOptions, 'template.dir', '');
        if (!baseDir)
            return html;
        return html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
            if (href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('//')) {
                return match;
            }
            const cssPath = path.resolve(baseDir, href);
            try {
                const cssContent = fs.readFileSync(cssPath, 'utf-8');
                return `<style>${cssContent}</style>`;
            }
            catch (_a) {
                return match;
            }
        });
    }
}
exports.EjsAdapter = EjsAdapter;
