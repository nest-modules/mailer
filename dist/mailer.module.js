"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Dependencies **/
const common_1 = require("@nestjs/common");
/** Modules **/
const mailer_core_module_1 = require("./mailer-core.module");
let MailerModule = MailerModule_1 = class MailerModule {
    static forRoot(transport, defaults) {
        return {
            module: MailerModule_1,
            modules: [
                mailer_core_module_1.MailerCoreModule.forRoot(transport, defaults),
            ],
        };
    }
};
MailerModule = MailerModule_1 = __decorate([
    common_1.Module({
        imports: [],
        controllers: [],
        components: [],
        exports: [],
    })
], MailerModule);
exports.MailerModule = MailerModule;
var MailerModule_1;
//# sourceMappingURL=mailer.module.js.map