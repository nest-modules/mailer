"use strict";
var MailerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const lodash_1 = require("lodash");
const mailer_constant_1 = require("./constants/mailer.constant");
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
    constructor(mailerOptions, transportFactory) {
        this.mailerOptions = mailerOptions;
        this.transportFactory = transportFactory;
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
            var _a;
            if (sendMailOptions.transporterName) {
                if ((_a = this.transporters) === null || _a === void 0 ? void 0 : _a.get(sendMailOptions.transporterName)) {
                    return yield this.transporters
                        .get(sendMailOptions.transporterName)
                        .sendMail(sendMailOptions);
                }
                else {
                    throw new ReferenceError(`Transporters object doesn't have ${sendMailOptions.transporterName} key`);
                }
            }
            else {
                if (this.transporter) {
                    return yield this.transporter.sendMail(sendMailOptions);
                }
                else {
                    throw new ReferenceError(`Transporter object undefined`);
                }
            }
        });
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
    tslib_1.__metadata("design:paramtypes", [Object, Object])
], MailerService);
