/** Dependencies **/
import { get } from 'lodash';
import { Injectable, Inject } from '@nestjs/common';
import { createTransport, SentMessageInfo, Transporter } from 'nodemailer';
import * as previewEmail from 'preview-email';

/** Constants **/
import { MAILER_OPTIONS } from './constants/mailer-options.constant';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';

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
      transporter.use('stream', (mail, callback) => {
        return previewEmail(mail.data)
          .then(() => callback())
          .catch(callback);
      });
    }
  }

  constructor(
    @Inject(MAILER_OPTIONS) private readonly mailerOptions: MailerOptions,
  ) {
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

    /** Transporters setup **/
    if (mailerOptions.transports) {
      Object.keys(mailerOptions.transports).forEach((name) => {
        this.transporters.set(
          name,
          createTransport(
            this.mailerOptions.transports![name],
            this.mailerOptions.defaults,
          ),
        );
        this.initTemplateAdapter(templateAdapter, this.transporters.get(name)!);
      });
    }

    /** Transporter setup **/
    if (mailerOptions.transport) {
      this.transporter = createTransport(
        this.mailerOptions.transport,
        this.mailerOptions.defaults,
      );
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
