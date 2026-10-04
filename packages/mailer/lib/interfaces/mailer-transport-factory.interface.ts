import { Transporter } from 'nodemailer';
import { TransportType } from './mailer-options.interface';

export interface MailerTransportFactory {
  createTransport(opts?: TransportType): Transporter;
}
