import { join } from 'node:path';
import { Module } from '@nestjs/common';
import {
  FileTransport,
  MailerModule,
  MailerPreviewModule,
} from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { AppController } from './app.controller';
import { WelcomeMail } from './mails/welcome.mail';

@Module({
  imports: [
    MailerModule.forRoot({
      // Development: every email is written to var/mail as an .eml file
      transport: new FileTransport({
        directory: process.env.MAIL_DIR ?? 'var/mail',
      }),
      defaults: { from: '"Example" <noreply@example.com>' },
      template: {
        dir: join(__dirname, '..', 'templates'),
        adapter: new HandlebarsAdapter(),
      },
      i18n: { defaultLocale: 'en' },
      retry: 3,
    }),
    // Open http://localhost:3000/_mailer
    MailerPreviewModule.register({
      // Your call: here, everywhere but production
      enabled: process.env.NODE_ENV !== 'production',
      previews: [
        {
          name: 'welcome',
          description: 'Sent after sign-up',
          mailable: WelcomeMail,
          data: { name: 'Ada', token: 'preview-token' },
        },
        {
          name: 'welcome-es',
          mailable: WelcomeMail,
          data: { name: 'Ada', token: 'preview-token' },
          locale: 'es',
        },
      ],
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
