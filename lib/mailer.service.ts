/** Dependencies **/
import { get, defaultsDeep } from 'lodash';
import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { SentMessageInfo, Transporter } from 'nodemailer';
import * as smtpTransport from 'nodemailer/lib/smtp-transport';

/** Constants **/
import {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { MailerTransportFactory } from './mailer-transport.factory';

@Injectable()
export class MailerService {
  private transporter!: Transporter;
  private transporters = new Map<string, Transporter>();
  private templateAdapter: TemplateAdapter;
  private initTemplateAdapter(
    templateAdapter: TemplateAdapter,
    transporter: Transporter,
  ): void {
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
      } catch (err) {
        this.mailerLogger.warn('preview-email is not installed. This is an optional dependency. Install it if you want to preview emails in the development environment. You can install it using npm (npm install preview-email), yarn (yarn add preview-email), or pnpm (pnpm add preview-email).');
      }

    if (this.mailerOptions.preview) {
      transporter.use('stream', (mail, callback) => {
        if (typeof previewEmail !== 'undefined') {
          return previewEmail(mail.data, this.mailerOptions.preview)
            .then(() => callback())
            .catch(callback);
        } else {
          this.mailerLogger.warn('previewEmail is not available. Skipping preview.');
          return callback();
        }
      });
    }
    }
  }

  private readonly mailerLogger = new Logger(MailerService.name);

  constructor(
    @Inject(MAILER_OPTIONS) private readonly mailerOptions: MailerOptions,
    @Optional()
    @Inject(MAILER_TRANSPORT_FACTORY)
    private readonly transportFactory: IMailerTransportFactory,
  ) {
    if (!transportFactory) {
      this.transportFactory = new MailerTransportFactory(mailerOptions);
    }

    this.validateTransportOptions();

    /** Adapter setup **/
    this.templateAdapter = get(
      this.mailerOptions,
      'template.adapter',
    );

    /*
     * Preview setup
     * THIS NEED TO RUN BEFORE ANY CALL TO `initTemplateAdapter`
     */
    if (this.mailerOptions.preview) {
      const defaults = { open: { wait: false } };
      this.mailerOptions.preview =
        typeof this.mailerOptions.preview === 'boolean'
          ? defaults
          : defaultsDeep(this.mailerOptions.preview, defaults);
    }

    /** Transporters setup **/
    this.setupTransporters();
  }

  private validateTransportOptions(): void {
    if (
      (!this.mailerOptions.transport ||
        Object.keys(this.mailerOptions.transport).length <= 0) &&
      !this.mailerOptions.transports
    ) {
      throw new Error(
        'Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.',
      );
    }
  }

  private createTransporter(config: string | smtpTransport | smtpTransport.Options, name?: string): Transporter {
    const transporter = this.transportFactory.createTransport(config);
    if (this.mailerOptions.verifyTransporters) this.verifyTransporter(transporter, name);
    this.initTemplateAdapter(this.templateAdapter, transporter);
    return transporter;
  }

  private setupTransporters(): void {
    if (this.mailerOptions.transports) {
      Object.keys(this.mailerOptions.transports).forEach((name) => {
        const transporter = this.createTransporter(this.mailerOptions.transports![name], name);
        this.transporters.set(name, transporter);
      });
    }

    if (this.mailerOptions.transport) {
      this.transporter = this.createTransporter(this.mailerOptions.transport);
    }
  }

  private verifyTransporter(transporter: Transporter, name?: string): void {
    const transporterName = name ? ` '${name}'` : '';
    if (!transporter.verify) return;
    Promise.resolve(transporter.verify())
      .then(() => this.mailerLogger.debug(`Transporter${transporterName} is ready`))
      .catch((error) => this.mailerLogger.error(`Error occurred while verifying the transporter${transporterName}: ${error.message}`));
  }

  public async verifyAllTransporters() {
    const transporters = [...this.transporters.values(), this.transporter];
    const transportersVerified = await Promise.all(transporters.map(transporter => {
      if (!transporter.verify) return true; // Can't verify with nodemailer-sendgrid, so assume it's verified
      return Promise.resolve(transporter.verify()).then(() => true).catch(() => false);
    }));
    return transportersVerified.every(verified => verified);
  }

  public async sendMail(
    sendMailOptions: ISendMailOptions,
  ): Promise<SentMessageInfo> {
    if (sendMailOptions.transporterName) {
      if (
        this.transporters &&
        this.transporters.get(sendMailOptions.transporterName)
      ) {
        return await this.transporters
          .get(sendMailOptions.transporterName)!
          .sendMail(sendMailOptions);
      } else {
        throw new ReferenceError(
          `Transporters object doesn't have ${sendMailOptions.transporterName} key`,
        );
      }
    } else {
      if (this.transporter) {
        return await this.transporter.sendMail(sendMailOptions);
      } else {
        throw new ReferenceError(`Transporter object undefined`);
      }
    }
  }

  addTransporter(transporterName: string, config: string | smtpTransport | smtpTransport.Options): string {
    this.transporters.set(
      transporterName,
      this.transportFactory.createTransport(config),
    );
    this.initTemplateAdapter(this.templateAdapter, this.transporters.get(transporterName)!);
    return transporterName;
  }
}
