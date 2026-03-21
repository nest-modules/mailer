"use strict";
var MailerCoreModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerCoreModule = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_health_indicator_1 = require("./health/mailer.health-indicator");
const mailer_service_1 = require("./mailer.service");
const mailer_batch_service_1 = require("./mailer-batch.service");
const mailer_event_service_1 = require("./mailer-event.service");
let MailerCoreModule = MailerCoreModule_1 = class MailerCoreModule {
    static forRoot(options) {
        const MailerOptionsProvider = {
            provide: mailer_constant_1.MAILER_OPTIONS,
            useValue: options,
        };
        return {
            module: MailerCoreModule_1,
            providers: [
                MailerOptionsProvider,
                mailer_event_service_1.MailerEventService,
                mailer_service_1.MailerService,
                mailer_batch_service_1.MailerBatchService,
                mailer_health_indicator_1.MailerHealthIndicator,
            ],
            exports: [
                mailer_service_1.MailerService,
                mailer_batch_service_1.MailerBatchService,
                mailer_event_service_1.MailerEventService,
                mailer_health_indicator_1.MailerHealthIndicator,
            ],
        };
    }
    static forRootAsync(options) {
        const providers = MailerCoreModule_1.createAsyncProviders(options);
        return {
            module: MailerCoreModule_1,
            providers: [
                ...providers,
                mailer_event_service_1.MailerEventService,
                mailer_service_1.MailerService,
                mailer_batch_service_1.MailerBatchService,
                mailer_health_indicator_1.MailerHealthIndicator,
                ...(options.extraProviders || []),
            ],
            imports: options.imports,
            exports: [
                mailer_service_1.MailerService,
                mailer_batch_service_1.MailerBatchService,
                mailer_event_service_1.MailerEventService,
                mailer_health_indicator_1.MailerHealthIndicator,
            ],
        };
    }
    static createAsyncProviders(options) {
        const providers = [
            MailerCoreModule_1.createAsyncOptionsProvider(options),
        ];
        if (options.useClass) {
            providers.push({
                provide: options.useClass,
                useClass: options.useClass,
            });
        }
        return providers;
    }
    static createAsyncOptionsProvider(options) {
        if (options.useFactory) {
            return {
                name: mailer_constant_1.MAILER_OPTIONS,
                provide: mailer_constant_1.MAILER_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject || [],
            };
        }
        return {
            name: mailer_constant_1.MAILER_OPTIONS,
            provide: mailer_constant_1.MAILER_OPTIONS,
            useFactory: (optionsFactory) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                return optionsFactory.createMailerOptions();
            }),
            inject: [options.useExisting || options.useClass],
        };
    }
};
exports.MailerCoreModule = MailerCoreModule;
exports.MailerCoreModule = MailerCoreModule = MailerCoreModule_1 = tslib_1.__decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], MailerCoreModule);
