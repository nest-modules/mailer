import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class AppService {
  constructor(private readonly mailerService: MailerService) {}

  getHello(): string {
    return 'Hello World!';
  }

  public example() {
    return this.mailerService.sendMail({
      to: 'user@gmail.com', // List of receivers email address
      from: 'user@outlook.com', // Senders email address
      subject: 'Testing Nest MailerModule ✔', // Subject line
      text: 'welcome', // plaintext body
      html: '<b>welcome</b>', // HTML body content
    });
  }

  public example2() {
    return this.mailerService.sendMail({
      to: 'user@gmail.com', // List of receivers email address
      from: 'user@outlook.com', // Senders email address
      subject: 'Testing Nest Mailermodule with template ✔',
      template: 'index', // The `.pug` or `.hbs` extension is appended automatically.
      context: {
        // Data to be sent to template engine.
        code: 'cf1a3f828287',
        username: 'john doe',
      },
    });
  }

  public example3() {
    return this.mailerService.sendMail({
      to: 'test@nestjs.com',
      from: 'noreply@nestjs.com',
      subject: 'Testing Nest Mailermodule with template ✔',
      template: `${__dirname}/welcome`, // The `.pug` or `.hbs` extension is appended automatically.
      context: {
        // Data to be sent to template engine.
        code: 'cf1a3f828287',
        username: 'john doe',
      },
    });
  }
}
