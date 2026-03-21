import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerOptionsFactory } from './interfaces/mailer-options-factory.interface';
import { MailerModule } from './mailer.module';
import { MailerService } from './mailer.service';

describe('MailerModule', () => {
  describe('forRoot', () => {
    it('should provide MailerService', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRoot({
            transport: 'smtps://user@domain.com:pass@smtp.domain.com',
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(MailerService);
    });

    it('should provide MailerService with transport options object', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRoot({
            transport: {
              host: 'smtp.example.com',
              port: 587,
              auth: { user: 'test', pass: 'test' },
            },
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });
  });

  describe('forRootAsync', () => {
    it('should provide MailerService with useFactory', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            useFactory: () => ({
              transport: 'smtps://user@domain.com:pass@smtp.domain.com',
            }),
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });

    it('should provide MailerService with async useFactory', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            useFactory: async () => ({
              transport: 'smtps://user@domain.com:pass@smtp.domain.com',
            }),
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });

    it('should provide MailerService with useClass', async () => {
      @Injectable()
      class TestMailerConfig implements MailerOptionsFactory {
        createMailerOptions(): MailerOptions {
          return {
            transport: 'smtps://user@domain.com:pass@smtp.domain.com',
          };
        }
      }

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            useClass: TestMailerConfig,
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });

    it('should provide MailerService with useExisting', async () => {
      @Injectable()
      class ExistingMailerConfig implements MailerOptionsFactory {
        createMailerOptions(): MailerOptions {
          return {
            transport: 'smtps://user@domain.com:pass@smtp.domain.com',
          };
        }
      }

      @Module({
        providers: [ExistingMailerConfig],
        exports: [ExistingMailerConfig],
      })
      class ConfigModule {}

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            imports: [ConfigModule],
            useExisting: ExistingMailerConfig,
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });

    it('should support extraProviders', async () => {
      const CUSTOM_TOKEN = 'CUSTOM_TOKEN';

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            useFactory: () => ({
              transport: 'smtps://user@domain.com:pass@smtp.domain.com',
            }),
            extraProviders: [
              { provide: CUSTOM_TOKEN, useValue: 'custom-value' },
            ],
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });

    it('should support inject with useFactory', async () => {
      const CONFIG_TOKEN = 'CONFIG_TOKEN';

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          MailerModule.forRootAsync({
            useFactory: (config: string) => ({
              transport: config,
            }),
            inject: [CONFIG_TOKEN],
            extraProviders: [
              {
                provide: CONFIG_TOKEN,
                useValue: 'smtps://user@domain.com:pass@smtp.domain.com',
              },
            ],
          }),
        ],
      }).compile();

      const service = module.get<MailerService>(MailerService);
      expect(service).toBeDefined();
    });
  });
});
