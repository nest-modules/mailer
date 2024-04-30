/** Dependencies **/
import { get } from 'lodash';
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

  private readonly mailerLogger = new Logger(MailerService.name);

  /**
   * Creates an instance of MailerService.
   * @param {MailerOptions} mailerOptions - The configuration options for the mailer service.
   * @param {IMailerTransportFactory} transportFactory - The factory used to create transporters.
   */
  constructor(
    @Inject(MAILER_OPTIONS) private readonly mailerOptions: MailerOptions,
    @Optional() @Inject(MAILER_TRANSPORT_FACTORY) private readonly transportFactory: IMailerTransportFactory,
  ) {
    if (!transportFactory) {
      this.transportFactory = new MailerTransportFactory(mailerOptions);
    }

    this.validateTransportOptions();
    this.setupTransporters();
    this.initializeTemplateAdapter();
  }

  /**
   * Validates the transport configuration options provided in mailerOptions.
   */
  private validateTransportOptions(): void {
    if (
      (!this.mailerOptions.transport ||
        Object.keys(this.mailerOptions.transport).length === 0) &&
      !this.mailerOptions.transports
    ) {
      throw new Error(
        'Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.',
      );
    }
  }

  /**
   * Initializes the template adapter for compiling email templates.
   */
  private initializeTemplateAdapter(): void {
    const templateAdapter = get(this.mailerOptions, 'template.adapter');
    if (templateAdapter) {
      this.templateAdapter = templateAdapter;
      [...this.transporters.values(), this.transporter].forEach(transporter => {
        if (transporter) this.initTemplateAdapter(this.templateAdapter, transporter);
      });
    }
  }

  /**
   * Attaches the template adapter to a transporter to process email templates.
   * @param {TemplateAdapter} templateAdapter - The template adapter instance.
   * @param {Transporter} transporter - The transporter instance.
   */
  private initTemplateAdapter(
    templateAdapter: TemplateAdapter,
    transporter: Transporter,
  ): void {
    transporter.use('compile', (mail, callback) => {
      if (mail.data.html) {
        return callback();
      }

      return templateAdapter.compile(mail, callback, this.mailerOptions);
    });

    if (this.mailerOptions.preview) {
      let previewEmail;
      try {
        previewEmail = require('preview-email');
      } catch (err) {
        this.mailerLogger.warn('preview-email is not installed. This is an optional dependency. Install it if you want to preview emails in the development environment.');
      }

      transporter.use('stream', (mail, callback) => {
        if (previewEmail) {
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

  /**
   * Sets up transporters from the provided configuration options.
   */
  private setupTransporters(): void {
    if (this.mailerOptions.transports) {
      Object.keys(this.mailerOptions.transports).forEach((name) => {
        const config = this.mailerOptions.transports[name];
        if (config) {
          const transporter = this.createTransporter(config, name);
          this.transporters.set(name, transporter);
        }
      });
    }

    if (this.mailerOptions.transport) {
      this.transporter = this.createTransporter(this.mailerOptions.transport);
    }
  }

  /**
   * Creates a new transporter from the configuration.
   * @param {string | smtpTransport | smtpTransport.Options} config - The transporter configuration.
   * @param {string} [name] - An optional name for the transporter.
   * @returns {Transporter} The created transporter instance.
   */
  private createTransporter(config: string | smtpTransport | smtpTransport.Options, name?: string): Transporter {
    const transporter = this.transportFactory.createTransport(config);
    if (this.mailerOptions.verifyTransporters) {
      this.verifyTransporter(transporter, name);
    }
    this.initTemplateAdapter(this.templateAdapter, transporter);
    return transporter;
  }

  /**
   * Verifies a transporter by checking its connectivity and configuration.
   * @param {Transporter} transporter - The transporter to verify.
   * @param {string} [name] - An optional name for the transporter.
   */
  private verifyTransporter(transporter: Transporter, name?: string): void {
    const transporterName = name ? ` '${name}'` : '';
    if (!transporter.verify) return;
    transporter.verify((error, _success) => {
      if (error) {
        this.mailerLogger.error(`Error occurred while verifying the transporter${transporterName}: ${error.message}`);
      } else {
        this.mailerLogger.debug(`Transporter${transporterName} is ready`);
      }
    });
  }

  /**
   * Sends an email using the specified transporter.
   * @param {ISendMailOptions} sendMailOptions - The options for the email to send.
   * @returns {Promise<SentMessageInfo>} The result of the email send operation.
   */
  public async sendMail(sendMailOptions: ISendMailOptions): Promise<SentMessageInfo> {
    if (sendMailOptions.transporterName) {
      const transporter = this.transporters.get(sendMailOptions.transporterName);
      if (transporter) {
        return transporter.sendMail(sendMailOptions);
      } else {
        throw new ReferenceError(`Transporter named '${sendMailOptions.transporterName}' not found.`);
      }
    } else {
      if (this.transporter) {
        return this.transporter.sendMail(sendMailOptions);
      } else {
        throw new ReferenceError(`Default transporter is not configured.`);
      }
    }
  }

  /**
   * Adds a new transporter with the given configuration and registers it under the specified name.
   * @param {string} transporterName - The name to register the transporter under.
   * @param {string | smtpTransport | smtpTransport.Options} config - The configuration for the new transporter.
   * @returns {string} The name under which the transporter was registered.
   */
  public addTransporter(transporterName: string, config: string | smtpTransport | smtpTransport.Options): string {
    const transporter = this.createTransporter(config);
    this.transporters.set(transporterName, transporter);
    return transporterName;
  }
}
