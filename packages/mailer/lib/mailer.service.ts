/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { defaultsDeep, get } from 'lodash';
import { SentMessageInfo, Transporter } from 'nodemailer';
/** Constants **/
import {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';

/** Interfaces **/
import { MailerEvent } from './interfaces/mailer-events.interface';
import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { MailerEventService } from './mailer-event.service';
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
      } catch (_err) {
        this.mailerLogger.warn(
          'preview-email is not installed. This is an optional dependency. Install it if you want to preview emails in the development environment. You can install it using npm (npm install preview-email), yarn (yarn add preview-email), or pnpm (pnpm add preview-email).',
        );
      }

      if (this.mailerOptions.preview) {
        transporter.use('stream', (mail, callback) => {
          if (typeof previewEmail !== 'undefined') {
            return previewEmail(mail.data, this.mailerOptions.preview)
              .then(() => callback())
              .catch(callback);
          } else {
            this.mailerLogger.warn(
              'previewEmail is not available. Skipping preview.',
            );
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
    @Optional()
    private readonly eventService?: MailerEventService,
  ) {
    if (!transportFactory) {
      this.transportFactory = new MailerTransportFactory(mailerOptions);
    }

    this.validateTransportOptions();

    /** Adapter setup **/
    this.templateAdapter = get(this.mailerOptions, 'template.adapter');

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

  private createTransporter(
    config: TransportType,
    name?: string,
  ): Transporter {
    const transporter = this.transportFactory.createTransport(config);
    if (this.mailerOptions.verifyTransporters)
      this.verifyTransporter(transporter, name);
    this.initTemplateAdapter(this.templateAdapter, transporter);
    return transporter;
  }

  private setupTransporters(): void {
    if (this.mailerOptions.transports) {
      Object.keys(this.mailerOptions.transports).forEach((name) => {
        const transporter = this.createTransporter(
          this.mailerOptions.transports![name],
          name,
        );
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
      .then(() =>
        this.mailerLogger.log(`Transporter${transporterName} is ready`),
      )
      .catch((error) =>
        this.mailerLogger.error(
          `Error occurred while verifying the transporter${transporterName}: ${error.message}`,
        ),
      );
  }

  public async verifyAllTransporters() {
    const transporters = [...this.transporters.values(), this.transporter];
    const transportersVerified = await Promise.all(
      transporters.map((transporter) => {
        if (!transporter.verify) return true; // Can't verify with nodemailer-sendgrid, so assume it's verified
        return Promise.resolve(transporter.verify())
          .then(() => true)
          .catch(() => false);
      }),
    );
    return transportersVerified.every((verified) => verified);
  }

  public async sendMail(
    sendMailOptions: ISendMailOptions,
  ): Promise<SentMessageInfo> {
    // i18n: resolve locale-specific template path
    if (sendMailOptions.template && sendMailOptions.locale && this.mailerOptions.i18n) {
      sendMailOptions = {
        ...sendMailOptions,
        template: this.resolveI18nTemplate(
          sendMailOptions.template,
          sendMailOptions.locale,
        ),
      };
    }

    // Template resolver: load template from external source
    if (
      sendMailOptions.template &&
      this.mailerOptions.template?.resolver &&
      !sendMailOptions.html
    ) {
      const resolved = await this.mailerOptions.template.resolver.resolve(
        sendMailOptions.template,
        sendMailOptions.context,
      );
      sendMailOptions = {
        ...sendMailOptions,
        html: resolved.content as any,
        // Apply metadata (e.g., subject from template)
        ...(resolved.metadata?.subject && !sendMailOptions.subject
          ? { subject: resolved.metadata.subject }
          : {}),
      };
    }

    // Emit before_send event
    this.eventService?.emit(MailerEvent.BEFORE_SEND, {
      mailOptions: sendMailOptions,
      timestamp: new Date(),
    });

    try {
      let result: SentMessageInfo;

      if (sendMailOptions.transporterName) {
        if (this.transporters?.get(sendMailOptions.transporterName)) {
          result = await this.transporters
            .get(sendMailOptions.transporterName)!
            .sendMail(sendMailOptions);
        } else {
          throw new ReferenceError(
            `Transporters object doesn't have ${sendMailOptions.transporterName} key`,
          );
        }
      } else {
        if (this.transporter) {
          result = await this.transporter.sendMail(sendMailOptions);
        } else {
          throw new ReferenceError(`Transporter object undefined`);
        }
      }

      // Emit after_send event
      this.eventService?.emit(MailerEvent.AFTER_SEND, {
        mailOptions: sendMailOptions,
        result,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      // Emit send_error event
      this.eventService?.emit(MailerEvent.SEND_ERROR, {
        mailOptions: sendMailOptions,
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Resolve a locale-specific template path.
   * Checks if the locale-specific template exists, falls back to default locale.
   */
  private resolveI18nTemplate(template: string, locale: string): string {
    const i18n = this.mailerOptions.i18n!;
    const pattern = i18n.templateDirPattern || '{{locale}}/';
    const templateDir = get(this.mailerOptions, 'template.dir', '');
    const localizedPrefix = pattern.replace('{{locale}}', locale);
    const localizedTemplate = path.join(localizedPrefix, template);

    // Check if the localized template file exists
    if (templateDir) {
      const ext = ['.hbs', '.pug', '.ejs', '.njk', '.liquid', '.html'];
      const basePath = path.join(templateDir, localizedTemplate);
      const exists = ext.some((e) => {
        try {
          fs.accessSync(basePath + e);
          return true;
        } catch {
          return false;
        }
      });

      if (exists) {
        return localizedTemplate;
      }
    }

    // Fallback to default locale
    if (i18n.fallback !== false && locale !== i18n.defaultLocale) {
      this.mailerLogger.debug(
        `Template "${localizedTemplate}" not found for locale "${locale}", falling back to "${i18n.defaultLocale}"`,
      );
      const fallbackPrefix = pattern.replace('{{locale}}', i18n.defaultLocale);
      return path.join(fallbackPrefix, template);
    }

    return localizedTemplate;
  }

  addTransporter(
    transporterName: string,
    config: TransportType,
  ): string {
    const transporter = this.createTransporter(config, transporterName);
    this.transporters.set(transporterName, transporter);
    return transporterName;
  }
}
