import { MailerOptions } from './interfaces/mailer-options.interface';
import { MailerTransportFactory } from './mailer-transport.factory';

describe('MailerTransportFactory', () => {
  it('should create a transporter from options.transport', () => {
    const options: MailerOptions = {
      transport: {
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'test', pass: 'test' },
      },
    };

    const factory = new MailerTransportFactory(options);
    const transporter = factory.createTransport();

    expect(transporter).toBeDefined();
    expect(transporter.sendMail).toBeDefined();
    expect(typeof transporter.sendMail).toBe('function');
  });

  it('should create a transporter from an explicit config', () => {
    const options: MailerOptions = {
      transport: { host: 'default.example.com', port: 587 },
    };

    const factory = new MailerTransportFactory(options);
    const transporter = factory.createTransport({
      host: 'override.example.com',
      port: 465,
    } as any);

    expect(transporter).toBeDefined();
  });

  it('should create a transporter from a connection string', () => {
    const options: MailerOptions = {
      transport: 'smtps://user:pass@smtp.example.com',
    };

    const factory = new MailerTransportFactory(options);
    const transporter = factory.createTransport();

    expect(transporter).toBeDefined();
  });

  it('should apply defaults to the transporter', () => {
    const options: MailerOptions = {
      transport: { host: 'smtp.example.com', port: 587 },
      defaults: {
        from: 'default@example.com',
      },
    };

    const factory = new MailerTransportFactory(options);
    const transporter = factory.createTransport();

    expect(transporter).toBeDefined();
  });
});
