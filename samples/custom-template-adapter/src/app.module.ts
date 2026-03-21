import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { TwingAdapter } from './adapters/twing.adapter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT, 10) || 1025,
        secure: process.env.SMTP_SECURE === 'true',
        ignoreTLS: process.env.SMTP_SECURE !== 'false',
        auth: {
          user: process.env.SMTP_AUTH_USER || 'username',
          pass: process.env.SMTP_AUTH_PASS || 'password',
        },
      },
      template: {
        dir: `${process.cwd()}/templates/`,
        adapter: new TwingAdapter(),
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
