import { Inject } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import * as Mail from 'nodemailer/lib/mailer';
import { MAILER_OPTIONS } from './constants/mailer.constant';
import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';

export class MailerTransportFactory implements IMailerTransportFactory {
  constructor(
    @Inject(MAILER_OPTIONS)
    private readonly options: MailerOptions,
  ) {}

  public createTransport(opts?: TransportType): Mail {
    return createTransport(
      opts || this.options.transport,
      this.options.defaults,
    ) as any;
  }
}
