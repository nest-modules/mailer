import { DynamicModule } from '@nestjs/common';
import { MailerAsyncOptions } from './interfaces/mailer-async-options.interface';
import { MailerOptions } from './interfaces/mailer-options.interface';
export declare class MailerCoreModule {
    static forRoot(options: MailerOptions): DynamicModule;
    static forRootAsync(options: MailerAsyncOptions): DynamicModule;
    private static createAsyncProviders;
    private static createAsyncOptionsProvider;
}
