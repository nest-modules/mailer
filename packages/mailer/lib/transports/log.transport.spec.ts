import { Logger, LoggerService } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { LogTransport } from './log.transport';

function createLogger(): jest.Mocked<LoggerService> {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

describe('LogTransport', () => {
  it('should identify itself as a nodemailer transport', () => {
    const transport = new LogTransport();
    expect(transport.name).toBe('LogTransport');
    expect(transport.version).toBe('1.0.0');
  });

  it('should log the subject, sender and recipients, and resolve', async () => {
    const logger = createLogger();
    const info = await createTransport(
      new LogTransport({ logger }) as any,
    ).sendMail({
      from: 'sender@example.test',
      to: 'ada@example.test',
      cc: 'bo@example.test',
      subject: 'Hello',
      text: 'Secret body',
    });

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      'Email "Hello"\n  from: sender@example.test\n  to: ada@example.test, bo@example.test',
    );
    expect(info).toEqual({
      envelope: {
        from: 'sender@example.test',
        to: ['ada@example.test', 'bo@example.test'],
      },
      messageId: expect.any(String),
      accepted: ['ada@example.test', 'bo@example.test'],
      rejected: [],
      response: '250 OK: logged by LogTransport',
    });
  });

  it('should list attachments, naming unnamed ones inline', async () => {
    const logger = createLogger();
    await createTransport(new LogTransport({ logger }) as any).sendMail({
      from: 'sender@example.test',
      to: 'ada@example.test',
      subject: 'Files',
      attachments: [
        { filename: 'report.pdf', content: 'pdf' },
        { content: 'img', cid: 'logo' },
      ],
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('\n  attachments: report.pdf, (inline)'),
    );
  });

  it('should log the text body when body is true', async () => {
    const logger = createLogger();
    await createTransport(
      new LogTransport({ logger, body: true }) as any,
    ).sendMail({
      from: 'sender@example.test',
      to: 'ada@example.test',
      subject: 'Hi',
      text: 'Hello Ada',
    });

    expect(logger.log).toHaveBeenCalledWith(
      'Email "Hi"\n  from: sender@example.test\n  to: ada@example.test\n\nHello Ada',
    );
  });

  it('should not log a missing text body even when body is true', async () => {
    const logger = createLogger();
    await createTransport(
      new LogTransport({ logger, body: true }) as any,
    ).sendMail({
      from: 'sender@example.test',
      to: 'ada@example.test',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });

    expect(logger.log).toHaveBeenCalledWith(
      'Email "Hi"\n  from: sender@example.test\n  to: ada@example.test',
    );
  });

  it('should log with a Nest Logger by default', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    try {
      await createTransport(new LogTransport() as any).sendMail({
        to: 'ada@example.test',
        subject: 'Default',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Email "Default"'),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('should reject without logging when the message cannot be built', async () => {
    const logger = createLogger();

    await expect(
      createTransport(new LogTransport({ logger }) as any).sendMail({
        to: 'ada@example.test',
        attachments: [{ path: '/definitely/missing/file.txt' }],
      }),
    ).rejects.toThrow();
    expect(logger.log).not.toHaveBeenCalled();
  });
});
