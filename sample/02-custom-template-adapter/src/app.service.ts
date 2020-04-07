import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor(private readonly mailerService: MailerService) {}

  getHello(): string {
    return 'Hello World!';
  }

  example() {
    return this.mailerService.sendMail({
      to: 'user@gmail.com', // List of receivers email address
      from: 'user@localhost', // Senders email address
      subject: 'Testing Nest Mailer module with template ✔',
      template: 'index', // The `.twig` extension is appended automatically.
      context: {
        // Data to be sent to template engine.
        code: 'cf1a3f828287',
        username: 'john doe',
      },
    });
  }
}
