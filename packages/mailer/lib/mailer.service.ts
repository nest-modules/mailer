/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
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
export class MailerService implements OnModuleDestroy {
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

    // Register user-defined nodemailer plugins
    if (this.mailerOptions.plugins) {
      for (const plugin of this.mailerOptions.plugins) {
        transporter.use(plugin.step, plugin.plugin);
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

  /** Feature 7: Auto-close transporter connections on module destroy */
  async onModuleDestroy(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.transporter) {
      closePromises.push(this.closeTransporter(this.transporter));
    }

    for (const [, transporter] of this.transporters) {
      closePromises.push(this.closeTransporter(transporter));
    }

    await Promise.allSettled(closePromises);
  }

  private async closeTransporter(transporter: Transporter): Promise<void> {
    try {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    } catch (error) {
      this.mailerLogger.warn(
        `Error closing transporter: ${(error as Error).message}`,
      );
    }
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

  private createTransporter(config: TransportType, name?: string): Transporter {
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

  /** Feature 1: Interpolate subject with template context */
  private interpolateSubject(
    subject: string,
    context?: Record<string, any>,
  ): string {
    if (!context || !subject) return subject;
    return subject.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmed = key.trim();
      return context[trimmed] !== undefined
        ? String(context[trimmed])
        : `{{${trimmed}}}`;
    });
  }

  /** Feature 3: Compile inline HTML string with template context */
  private interpolateHtml(html: string, context?: Record<string, any>): string {
    if (!context || !html) return html;
    return html.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmed = key.trim();
      return context[trimmed] !== undefined
        ? String(context[trimmed])
        : `{{${trimmed}}}`;
    });
  }

  public async sendMail(
    sendMailOptions: ISendMailOptions,
  ): Promise<SentMessageInfo> {
    // Feature 1: Subject template parsing
    if (sendMailOptions.subject && sendMailOptions.context) {
      sendMailOptions = {
        ...sendMailOptions,
        subject: this.interpolateSubject(
          sendMailOptions.subject,
          sendMailOptions.context,
        ),
      };
    }

    // Feature 3: HTML string interpolation (when no file-based template)
    if (
      sendMailOptions.html &&
      typeof sendMailOptions.html === 'string' &&
      sendMailOptions.context &&
      !sendMailOptions.template
    ) {
      sendMailOptions = {
        ...sendMailOptions,
        html: this.interpolateHtml(
          sendMailOptions.html as string,
          sendMailOptions.context,
        ),
      };
    }

    // Feature 4: Text/plain fallback template
    if (
      sendMailOptions.textTemplate &&
      sendMailOptions.context &&
      this.mailerOptions.template?.dir
    ) {
      sendMailOptions = {
        ...sendMailOptions,
        text: await this.compileTextTemplate(
          sendMailOptions.textTemplate,
          sendMailOptions.context,
        ),
      };
    }

    // i18n: resolve locale-specific template path
    if (
      sendMailOptions.template &&
      sendMailOptions.locale &&
      this.mailerOptions.i18n
    ) {
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

    // Feature 9: Send timeout
    const timeout = sendMailOptions.timeout ?? this.mailerOptions.sendTimeout;

    try {
      let result: SentMessageInfo;
      const sendPromise = this.executeSend(sendMailOptions);

      if (timeout && timeout > 0) {
        result = await this.withTimeout(sendPromise, timeout);
      } else {
        result = await sendPromise;
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

  /** Execute the actual send via the appropriate transporter */
  private async executeSend(
    sendMailOptions: ISendMailOptions,
  ): Promise<SentMessageInfo> {
    if (sendMailOptions.transporterName) {
      if (this.transporters?.get(sendMailOptions.transporterName)) {
        return this.transporters
          .get(sendMailOptions.transporterName)!
          .sendMail(sendMailOptions);
      }
      throw new ReferenceError(
        `Transporters object doesn't have ${sendMailOptions.transporterName} key`,
      );
    }
    if (this.transporter) {
      return this.transporter.sendMail(sendMailOptions);
    }
    throw new ReferenceError('Transporter object undefined');
  }

  /** Feature 9: Timeout wrapper */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Send mail timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** Feature 4: Compile a plain text template file */
  private async compileTextTemplate(
    templatePath: string,
    context: Record<string, any>,
  ): Promise<string> {
    const templateDir = get(this.mailerOptions, 'template.dir', '');
    const ext = path.extname(templatePath) || '.txt';
    const name = path.basename(templatePath, path.extname(templatePath));
    const fullPath = path.join(
      templateDir,
      path.dirname(templatePath),
      name + ext,
    );

    try {
      let content = fs.readFileSync(fullPath, 'utf-8');
      // Simple interpolation for text templates
      content = content.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const trimmed = key.trim();
        return context[trimmed] !== undefined
          ? String(context[trimmed])
          : `{{${trimmed}}}`;
      });
      return content;
    } catch {
      this.mailerLogger.warn(
        `Text template "${fullPath}" not found, skipping text fallback.`,
      );
      return '';
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

  /** Get the default transporter (for advanced use cases) */
  public getTransporter(name?: string): Transporter {
    if (name) {
      const transporter = this.transporters.get(name);
      if (!transporter) {
        throw new ReferenceError(
          `Transporters object doesn't have ${name} key`,
        );
      }
      return transporter;
    }
    return this.transporter;
  }

  addTransporter(transporterName: string, config: TransportType): string {
    const transporter = this.createTransporter(config, transporterName);
    this.transporters.set(transporterName, transporter);
    return transporterName;
  }

  /** Remove and close a named transporter */
  removeTransporter(transporterName: string): boolean {
    const transporter = this.transporters.get(transporterName);
    if (transporter) {
      this.closeTransporter(transporter);
      return this.transporters.delete(transporterName);
    }
    return false;
  }
}
