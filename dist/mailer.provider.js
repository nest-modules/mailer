"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Dependencies **/
const common_1 = require("@nestjs/common");
const nodemailer_1 = require("nodemailer");
const path_1 = require("path");
const pug_1 = require("pug");
let MailerProvider = class MailerProvider {
    constructor(mailerConfig) {
        this.mailerConfig = mailerConfig;
        if ((!mailerConfig.transport) || (Object.keys(mailerConfig.transport).length < 1)) {
            throw new Error("Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance");
        }
        this.setupTransporter(mailerConfig.transport, mailerConfig.defaults, mailerConfig.templateDir);
    }
    setupTransporter(transport, defaults, templateDir) {
        this.transporter = nodemailer_1.createTransport(transport, defaults);
        this.transporter.use('compile', this.renderTemplate(templateDir));
    }
    sendMail(sendMailOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.transporter.sendMail(sendMailOptions);
        });
    }
    renderTemplate(templateDir) {
        return (mail, callback) => {
            if (mail.data.html)
                return callback();
            let templatePath = path_1.join(process.cwd(), templateDir || './public/templates', mail.data.template + '.pug');
            pug_1.renderFile(templatePath, mail.data.context, (err, body) => {
                if (err)
                    return callback(err);
                mail.data.html = body;
                callback();
            });
        };
    }
};
MailerProvider = __decorate([
    common_1.Component(),
    __param(0, common_1.Inject('MAILER_CONFIG')),
    __metadata("design:paramtypes", [Object])
], MailerProvider);
exports.MailerProvider = MailerProvider;
//# sourceMappingURL=mailer.provider.js.map