import { createTransport } from 'nodemailer';
import * as Mail from 'nodemailer/lib/mailer';

import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { Inject } from '@nestjs/common';
import { MAILER_OPTIONS } from './constants/mailer.constant';


/**
 * @class MailerTransportFactory
 * @description A factory for creating mail transporters
 */
export class MailerTransportFactory implements IMailerTransportFactory {
  /**
   * @constructor
   * @param {MailerOptions} options - The options for creating the mail transporter
   */
  constructor(
    @Inject(MAILER_OPTIONS)
    private readonly options: MailerOptions,
  ) {}

  /**
   * @method createTransport
   * @description Creates a mail transporter
   * @param {TransportType} [opts] - The options for creating the mail transporter
   * @returns {Mail} - The created mail transporter
   */
  public createTransport(opts?: TransportType): Mail {
    return createTransport(
      opts || this.options.transport,
      this.options.defaults,
    );
  }
}
