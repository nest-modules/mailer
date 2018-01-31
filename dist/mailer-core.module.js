"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
/** Providers **/
const mailer_provider_1 = require("./mailer.provider");
let MailerCoreModule = MailerCoreModule_1 = class MailerCoreModule {
    static forRoot(config) {
        const MailerConfig = {
            name: 'MAILER_CONFIG',
            provide: 'MAILER_CONFIG',
            useValue: {
                transport: config.transport,
                defaults: config.defaults,
                templateDir: config.templateDir
            },
        };
        return {
            module: MailerCoreModule_1,
            components: [
                mailer_provider_1.MailerProvider,
                MailerConfig,
            ],
            exports: [
                mailer_provider_1.MailerProvider,
            ],
        };
    }
};
MailerCoreModule = MailerCoreModule_1 = __decorate([
    common_1.Global(),
    common_1.Module({
        imports: [],
        controllers: [],
        components: [],
        exports: [],
    })
], MailerCoreModule);
exports.MailerCoreModule = MailerCoreModule;
var MailerCoreModule_1;
//# sourceMappingURL=mailer-core.module.js.map