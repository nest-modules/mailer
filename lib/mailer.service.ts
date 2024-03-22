/** Dependencies **/
import { get, defaultsDeep } from 'lodash';
import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { SentMessageInfo, Transporter } from 'nodemailer';
import * as previewEmail from 'preview-email';
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

      if (this.mailerOptions.preview) {
        transporter.use('stream', (mail, callback) => {
          return previewEmail(mail.data, this.mailerOptions.preview)
            .then(() => callback())
            .catch(callback);
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
    if (
      (!mailerOptions.transport ||
        Object.keys(mailerOptions.transport).length <= 0) &&
      !mailerOptions.transports
    ) {
      throw new Error(
        'Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.',
      );
    }

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
    if (mailerOptions.transports) {
      Object.keys(mailerOptions.transports).forEach((name) => {
        const transporter = this.transportFactory.createTransport(this.mailerOptions.transports![name])
        this.transporters.set(name, transporter);
        this.verifyTransporter(transporter, name);
        this.initTemplateAdapter(this.templateAdapter, transporter);
      });
    }

    /** Transporter setup **/
    if (mailerOptions.transport) {
      this.transporter = this.transportFactory.createTransport();
      this.verifyTransporter(this.transporter);
      this.initTemplateAdapter(this.templateAdapter, this.transporter);
    }
  }

  private verifyTransporter(transporter: Transporter, name?: string): void {
    const transporterName = name ? ` '${name}'` : '';

    // wrap value in a promise to ensure then is always defined
    new Promise(()=>transporter?.verify())
            .then(() => this.mailerLogger.log(`Transporter${transporterName} is ready`))
            .catch((error) => this.mailerLogger.log(`Error occurred while verifying the transporter${transporterName}}: ${error.message}`));
  }

  public async verifyAllTransporters() {
    const transporters = [...this.transporters.values(), this.transporter];
    const transportersVerified = await Promise.all(transporters.map(transporter => transporter.verify().catch(() => false)));
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
