import { MailerQueueOptions } from './interfaces/queue-options.interface';
import { MailerQueueModule } from './mailer-queue.module';
import { MailerQueueService } from './mailer-queue.service';

const baseOptions: MailerQueueOptions = {
  connection: { host: 'localhost', port: 6379 },
};

describe('MailerQueueModule', () => {
  describe('register', () => {
    it('should not be global by default', () => {
      const dynamicModule = MailerQueueModule.register(baseOptions);
      expect(dynamicModule.global).toBe(false);
      expect(dynamicModule.exports).toContain(MailerQueueService);
    });

    it('should be global when global: true is passed (issue #1311)', () => {
      const dynamicModule = MailerQueueModule.register({
        ...baseOptions,
        global: true,
      });
      expect(dynamicModule.global).toBe(true);
    });
  });

  describe('registerAsync', () => {
    it('should not be global by default', () => {
      const dynamicModule = MailerQueueModule.registerAsync({
        useFactory: () => baseOptions,
      });
      expect(dynamicModule.global).toBe(false);
    });

    it('should be global when global: true is passed (issue #1311)', () => {
      const dynamicModule = MailerQueueModule.registerAsync({
        global: true,
        useFactory: () => baseOptions,
      });
      expect(dynamicModule.global).toBe(true);
    });
  });
});
