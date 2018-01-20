/** Dependencies **/
import { Component, Inject } from '@nestjs/common';
import { createTransport, SentMessageInfo, Transporter, SendMailOptions } from 'nodemailer';

@Component()
export class MailerProvider {

  private transporter: Transporter;

  constructor(@Inject('MAILER_CONFIG') private readonly mailerConfig: { transport?: any, defaults?: any }) {
    this.setupTransporter(mailerConfig.transport, mailerConfig.defaults);
  }

  private setupTransporter(transport?: any, defaults?: any): void {
    this.transporter = createTransport(transport, defaults);
  }

  public async sendMail(sendMailOptions: SendMailOptions): Promise<SentMessageInfo> {
    return await this.transporter.sendMail(sendMailOptions);
  }

}
