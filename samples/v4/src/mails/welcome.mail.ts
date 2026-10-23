import { Injectable } from '@nestjs/common';
import { Mailable, MailableContext } from '@nestjs-modules/mailer';

export interface WelcomeData {
  name: string;
  token: string;
}

const LOGO = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#e0234e"/></svg>',
);

/** A typed mail class: `mailerService.send(WelcomeMail, { to, data })` */
@Injectable()
export class WelcomeMail implements Mailable<WelcomeData> {
  render({ name, token }: WelcomeData, { locale }: MailableContext) {
    return {
      subject: locale === 'es' ? `Bienvenido, ${name}` : `Welcome, ${name}`,
      template: 'welcome',
      context: { name, verifyUrl: `https://example.com/verify?token=${token}` },
      attachments: [
        {
          filename: 'logo.svg',
          cid: 'logo',
          content: LOGO,
          contentType: 'image/svg+xml',
        },
      ],
    };
  }
}
