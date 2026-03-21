"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerTransportFactory = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const nodemailer_1 = require("nodemailer");
const mailer_constant_1 = require("./constants/mailer.constant");
let MailerTransportFactory = class MailerTransportFactory {
    constructor(options) {
        this.options = options;
    }
    createTransport(opts) {
        return (0, nodemailer_1.createTransport)(opts || this.options.transport, this.options.defaults);
    }
};
exports.MailerTransportFactory = MailerTransportFactory;
exports.MailerTransportFactory = MailerTransportFactory = tslib_1.__decorate([
    tslib_1.__param(0, (0, common_1.Inject)(mailer_constant_1.MAILER_OPTIONS)),
    tslib_1.__metadata("design:paramtypes", [Object])
], MailerTransportFactory);
