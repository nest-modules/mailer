import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
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
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
