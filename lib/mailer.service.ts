/** Dependencies **/
import { get } from 'lodash';
import { Injectable, Inject } from '@nestjs/common';
import { createTransport, SentMessageInfo, Transporter } from 'nodemailer';

/** Constants **/
import { MAILER_OPTIONS } from './constants/mailer-options.constant';

/** Interfaces **/
import { MailerOptions } from './interfaces/mailer-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { SendMailOptions } from './interfaces/send-mail-options.interface';

@Injectable()
export class MailerService {
  private transporter: Transporter;

  constructor(@Inject(MAILER_OPTIONS) private readonly mailerOptions: MailerOptions) {
    if (!mailerOptions.transport || Object.keys(mailerOptions.transport).length <= 0) {
      throw new Error('Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.');
    }

    /** Transporter setup **/
    this.transporter = createTransport(this.mailerOptions.transport, this.mailerOptions.defaults);

    /** Adapter setup **/
    const templateAdapter: TemplateAdapter = get(this.mailerOptions, 'template.adapter');

    if (templateAdapter) {
      this.transporter.use('compile', (mail, callback) => {
        if (mail.data.html) {
          return callback();
        }

        return templateAdapter.compile(mail, callback, this.mailerOptions);
      });
    }
  }

  public async sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo> {
    return await this.transporter.sendMail(sendMailOptions);
  }
}
