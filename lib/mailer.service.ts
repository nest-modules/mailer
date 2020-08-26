/** Dependencies **/
import { get, defaultsDeep } from 'lodash';
import { Injectable, Inject, Optional } from '@nestjs/common';
import { SentMessageInfo, Transporter } from 'nodemailer';
import * as previewEmail from 'preview-email';

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
    const templateAdapter: TemplateAdapter = get(
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
        this.transporters.set(
          name,
          this.transportFactory.createTransport(
            this.mailerOptions.transports![name],
          ),
        );
        this.initTemplateAdapter(templateAdapter, this.transporters.get(name)!);
      });
    }

    /** Transporter setup **/
    if (mailerOptions.transport) {
      this.transporter = this.transportFactory.createTransport();
      this.initTemplateAdapter(templateAdapter, this.transporter);
    }
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
}
