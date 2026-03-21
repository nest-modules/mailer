"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiquidAdapter = void 0;
const tslib_1 = require("tslib");
const path = tslib_1.__importStar(require("node:path"));
const liquidjs_1 = require("liquidjs");
const lodash_1 = require("lodash");
class LiquidAdapter {
    constructor(config) {
        this.config = {};
        if (config) {
            Object.assign(this.config, config);
        }
    }
    compile(mail, callback, mailerOptions) {
        const { context, template } = mail.data;
        const templateExt = path.extname(template) || '.liquid';
        const templateName = path.basename(template, path.extname(template));
        const templateDir = path.isAbsolute(template)
            ? path.dirname(template)
            : path.join((0, lodash_1.get)(mailerOptions, 'template.dir', ''), path.dirname(template));
        const engine = new liquidjs_1.Liquid(Object.assign({ extname: templateExt, root: templateDir }, this.config.globals));
        engine
            .renderFile(templateName, context)
            .then((body) => {
            mail.data.html = body;
            return callback();
        })
            .catch((err) => {
            return callback(err);
        });
    }
}
exports.LiquidAdapter = LiquidAdapter;
