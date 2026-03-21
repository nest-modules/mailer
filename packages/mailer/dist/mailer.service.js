"use strict";
var MailerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerService = void 0;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("node:fs"));
const path = tslib_1.__importStar(require("node:path"));
const common_1 = require("@nestjs/common");
const lodash_1 = require("lodash");
const mailer_constant_1 = require("./constants/mailer.constant");
const mailer_events_interface_1 = require("./interfaces/mailer-events.interface");
const mailer_event_service_1 = require("./mailer-event.service");
const mailer_transport_factory_1 = require("./mailer-transport.factory");
let MailerService = MailerService_1 = class MailerService {
    initTemplateAdapter(templateAdapter, transporter) {
        if (templateAdapter) {
            transporter.use('compile', (mail, callback) => {
                if (mail.data.html) {
                    return callback();
                }
                return templateAdapter.compile(mail, callback, this.mailerOptions);
            });
            let previewEmail;
            try {
                previewEmail = require('preview-email');
            }
            catch (_err) {
                this.mailerLogger.warn('preview-email is not installed. This is an optional dependency. Install it if you want to preview emails in the development environment. You can install it using npm (npm install preview-email), yarn (yarn add preview-email), or pnpm (pnpm add preview-email).');
            }
            if (this.mailerOptions.preview) {
                transporter.use('stream', (mail, callback) => {
                    if (typeof previewEmail !== 'undefined') {
                        return previewEmail(mail.data, this.mailerOptions.preview)
                            .then(() => callback())
                            .catch(callback);
                    }
                    else {
                        this.mailerLogger.warn('previewEmail is not available. Skipping preview.');
                        return callback();
                    }
                });
            }
        }
    }
    constructor(mailerOptions, transportFactory, eventService) {
        this.mailerOptions = mailerOptions;
        this.transportFactory = transportFactory;
        this.eventService = eventService;
        this.transporters = new Map();
        this.mailerLogger = new common_1.Logger(MailerService_1.name);
        if (!transportFactory) {
            this.transportFactory = new mailer_transport_factory_1.MailerTransportFactory(mailerOptions);
        }
        this.validateTransportOptions();
        this.templateAdapter = (0, lodash_1.get)(this.mailerOptions, 'template.adapter');
        if (this.mailerOptions.preview) {
            const defaults = { open: { wait: false } };
            this.mailerOptions.preview =
                typeof this.mailerOptions.preview === 'boolean'
                    ? defaults
                    : (0, lodash_1.defaultsDeep)(this.mailerOptions.preview, defaults);
        }
        this.setupTransporters();
    }
    validateTransportOptions() {
        if ((!this.mailerOptions.transport ||
            Object.keys(this.mailerOptions.transport).length <= 0) &&
            !this.mailerOptions.transports) {
            throw new Error('Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.');
        }
    }
    createTransporter(config, name) {
        const transporter = this.transportFactory.createTransport(config);
        if (this.mailerOptions.verifyTransporters)
            this.verifyTransporter(transporter, name);
        this.initTemplateAdapter(this.templateAdapter, transporter);
        return transporter;
    }
    setupTransporters() {
        if (this.mailerOptions.transports) {
            Object.keys(this.mailerOptions.transports).forEach((name) => {
                const transporter = this.createTransporter(this.mailerOptions.transports[name], name);
                this.transporters.set(name, transporter);
            });
        }
        if (this.mailerOptions.transport) {
            this.transporter = this.createTransporter(this.mailerOptions.transport);
        }
    }
    verifyTransporter(transporter, name) {
        const transporterName = name ? ` '${name}'` : '';
        if (!transporter.verify)
            return;
        Promise.resolve(transporter.verify())
            .then(() => this.mailerLogger.log(`Transporter${transporterName} is ready`))
            .catch((error) => this.mailerLogger.error(`Error occurred while verifying the transporter${transporterName}: ${error.message}`));
    }
    verifyAllTransporters() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const transporters = [...this.transporters.values(), this.transporter];
            const transportersVerified = yield Promise.all(transporters.map((transporter) => {
                if (!transporter.verify)
                    return true;
                return Promise.resolve(transporter.verify())
                    .then(() => true)
                    .catch(() => false);
            }));
            return transportersVerified.every((verified) => verified);
        });
    }
    sendMail(sendMailOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            if (sendMailOptions.template && sendMailOptions.locale && this.mailerOptions.i18n) {
                sendMailOptions = Object.assign(Object.assign({}, sendMailOptions), { template: this.resolveI18nTemplate(sendMailOptions.template, sendMailOptions.locale) });
            }
            if (sendMailOptions.template &&
                ((_a = this.mailerOptions.template) === null || _a === void 0 ? void 0 : _a.resolver) &&
                !sendMailOptions.html) {
                const resolved = yield this.mailerOptions.template.resolver.resolve(sendMailOptions.template, sendMailOptions.context);
                sendMailOptions = Object.assign(Object.assign(Object.assign({}, sendMailOptions), { html: resolved.content }), (((_b = resolved.metadata) === null || _b === void 0 ? void 0 : _b.subject) && !sendMailOptions.subject
                    ? { subject: resolved.metadata.subject }
                    : {}));
            }
            (_c = this.eventService) === null || _c === void 0 ? void 0 : _c.emit(mailer_events_interface_1.MailerEvent.BEFORE_SEND, {
                mailOptions: sendMailOptions,
                timestamp: new Date(),
            });
            try {
                let result;
                if (sendMailOptions.transporterName) {
                    if ((_d = this.transporters) === null || _d === void 0 ? void 0 : _d.get(sendMailOptions.transporterName)) {
                        result = yield this.transporters
                            .get(sendMailOptions.transporterName)
                            .sendMail(sendMailOptions);
                    }
                    else {
                        throw new ReferenceError(`Transporters object doesn't have ${sendMailOptions.transporterName} key`);
                    }
                }
                else {
                    if (this.transporter) {
                        result = yield this.transporter.sendMail(sendMailOptions);
                    }
                    else {
                        throw new ReferenceError(`Transporter object undefined`);
                    }
                }
                (_e = this.eventService) === null || _e === void 0 ? void 0 : _e.emit(mailer_events_interface_1.MailerEvent.AFTER_SEND, {
                    mailOptions: sendMailOptions,
                    result,
                    timestamp: new Date(),
                });
                return result;
            }
            catch (error) {
                (_f = this.eventService) === null || _f === void 0 ? void 0 : _f.emit(mailer_events_interface_1.MailerEvent.SEND_ERROR, {
                    mailOptions: sendMailOptions,
                    error: error,
                    timestamp: new Date(),
                });
                throw error;
            }
        });
    }
    resolveI18nTemplate(template, locale) {
        const i18n = this.mailerOptions.i18n;
        const pattern = i18n.templateDirPattern || '{{locale}}/';
        const templateDir = (0, lodash_1.get)(this.mailerOptions, 'template.dir', '');
        const localizedPrefix = pattern.replace('{{locale}}', locale);
        const localizedTemplate = path.join(localizedPrefix, template);
        if (templateDir) {
            const ext = ['.hbs', '.pug', '.ejs', '.njk', '.liquid', '.html'];
            const basePath = path.join(templateDir, localizedTemplate);
            const exists = ext.some((e) => {
                try {
                    fs.accessSync(basePath + e);
                    return true;
                }
                catch (_a) {
                    return false;
                }
            });
            if (exists) {
                return localizedTemplate;
            }
        }
        if (i18n.fallback !== false && locale !== i18n.defaultLocale) {
            this.mailerLogger.debug(`Template "${localizedTemplate}" not found for locale "${locale}", falling back to "${i18n.defaultLocale}"`);
            const fallbackPrefix = pattern.replace('{{locale}}', i18n.defaultLocale);
            return path.join(fallbackPrefix, template);
        }
        return localizedTemplate;
    }
    addTransporter(transporterName, config) {
        const transporter = this.createTransporter(config, transporterName);
        this.transporters.set(transporterName, transporter);
        return transporterName;
    }
};
exports.MailerService = MailerService;
exports.MailerService = MailerService = MailerService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Inject)(mailer_constant_1.MAILER_OPTIONS)),
    tslib_1.__param(1, (0, common_1.Optional)()),
    tslib_1.__param(1, (0, common_1.Inject)(mailer_constant_1.MAILER_TRANSPORT_FACTORY)),
    tslib_1.__param(2, (0, common_1.Optional)()),
    tslib_1.__metadata("design:paramtypes", [Object, Object, mailer_event_service_1.MailerEventService])
], MailerService);
