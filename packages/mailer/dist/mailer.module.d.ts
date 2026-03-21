import { DynamicModule } from '@nestjs/common';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';
import { MailerOptions } from './interfaces/mailer-options.interface';
export declare class MailerModule {
    static forRoot(options?: MailerOptions): DynamicModule;
    static forRootAsync(options: MailerAsyncOptions): DynamicModule;
}
