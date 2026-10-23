import { Body, Controller, Post } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { WelcomeMail } from './mails/welcome.mail';

@Controller()
export class AppController {
  constructor(private readonly mailer: MailerService) {}

  @Post('signup')
  async signup(@Body() body: { email: string; name: string; locale?: string }) {
    const info = await this.mailer.send(WelcomeMail, {
      to: body.email,
      data: { name: body.name, token: 'demo-token' },
      locale: body.locale,
      // Redelivering the same signup reuses the same Message-ID
      idempotencyKey: `signup:${body.email}`,
    });
    return { messageId: info.messageId };
  }
}
