"use strict";
var MailerModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_core_module_1 = require("./mailer-core.module");
let MailerModule = MailerModule_1 = class MailerModule {
    static forRoot(options) {
        return {
            module: MailerModule_1,
            imports: [
                mailer_core_module_1.MailerCoreModule.forRoot(options),
            ],
        };
    }
    static forRootAsync(options) {
        return {
            module: MailerModule_1,
            imports: [
                mailer_core_module_1.MailerCoreModule.forRootAsync(options),
            ],
        };
    }
};
exports.MailerModule = MailerModule;
exports.MailerModule = MailerModule = MailerModule_1 = tslib_1.__decorate([
    (0, common_1.Module)({})
], MailerModule);
