"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlebarsAdapter = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("node:fs"));
const path = tslib_1.__importStar(require("node:path"));
const css_inline_1 = require("@css-inline/css-inline");
const glob = tslib_1.__importStar(require("glob"));
const handlebars = tslib_1.__importStar(require("handlebars"));
const lodash_1 = require("lodash");
class HandlebarsAdapter {
    constructor(helpers, config) {
        this.precompiledTemplates = {};
        this.config = {
            inlineCssOptions: {},
            inlineCssEnabled: true,
        };
        handlebars.registerHelper('concat', (...args) => {
            args.pop();
            return args.join('');
        });
        handlebars.registerHelper(helpers || {});
        Object.assign(this.config, config);
    }
    compile(mail, callback, mailerOptions) {
        const precompile = (template, callback, options) => {
            var _a;
            const templateBaseDir = (0, lodash_1.get)(options, 'dir', '');
            const templateExt = path.extname(template) || '.hbs';
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
                        templatePath = altPath;
                        break;
                    }
                }
            }
            if (!this.precompiledTemplates[templateName]) {
                try {
                    const template = fs.readFileSync(templatePath, 'utf-8');
                    this.precompiledTemplates[templateName] = handlebars.compile(template, (0, lodash_1.get)(options, 'options', {}));
                }
                catch (err) {
                    return callback(err);
                }
            }
            return {
                templateExt,
                templateName,
                templateDir,
                templatePath,
            };
        };
        const { templateName } = precompile(mail.data.template, callback, mailerOptions.template);
        const runtimeOptions = (0, lodash_1.get)(mailerOptions, 'options', {
            partials: false,
            data: {},
        });
        if (runtimeOptions.partials) {
            const partialPath = path
                .join(runtimeOptions.partials.dir, '**', '*.hbs')
                .replace(/\\/g, '/');
            const files = glob.sync(partialPath);
            files.forEach((file) => {
                const { templateName, templatePath } = precompile(file, () => { }, runtimeOptions.partials);
                const templateDir = path.relative(runtimeOptions.partials.dir, path.dirname(templatePath));
                handlebars.registerPartial(path.join(templateDir, templateName), fs.readFileSync(templatePath, 'utf-8'));
            });
        }
        const layoutName = (0, lodash_1.get)(mailerOptions, 'options.layout', null);
        let rendered = this.precompiledTemplates[templateName](mail.data.context, Object.assign(Object.assign({}, runtimeOptions), { partials: this.precompiledTemplates }));
        if (layoutName) {
            const layoutDir = (0, lodash_1.get)(mailerOptions, 'template.dir', '');
            const layoutExt = '.hbs';
            const layoutPath = path.join(layoutDir, layoutName + layoutExt);
            if (!this.precompiledTemplates[`__layout_${layoutName}`]) {
                try {
                    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
                    this.precompiledTemplates[`__layout_${layoutName}`] =
                        handlebars.compile(layoutContent);
                }
                catch (_a) {
                }
            }
            const layoutTemplate = this.precompiledTemplates[`__layout_${layoutName}`];
            if (layoutTemplate) {
                rendered = layoutTemplate(Object.assign(Object.assign({}, mail.data.context), { body: new handlebars.SafeString(rendered) }));
            }
        }
        rendered = this.resolveExternalCss(rendered, mailerOptions);
        if (this.config.inlineCssEnabled) {
            try {
                mail.data.html = (0, css_inline_1.inline)(rendered, this.config.inlineCssOptions);
            }
            catch (e) {
                callback(e);
            }
        }
        else {
            mail.data.html = rendered;
        }
        return callback();
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
exports.HandlebarsAdapter = HandlebarsAdapter;
