import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { MailerOptions } from '../interfaces/mailer-options.interface';
import { FileTransport } from './file.transport';
import { LogTransport } from './log.transport';
import { TestMailbox } from './test-mailbox';

describe('FileTransport', () => {
  let tmp: string;
  let directory: string;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-file-transport-'));
    // A missing subdirectory, to show it is created
    directory = path.join(tmp, 'nested', 'mail');
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function filesIn(dir: string): string[] {
    return fs.readdirSync(dir).sort();
  }

  it('should identify itself as a nodemailer transport', () => {
    const transport = new FileTransport();
    expect(transport.name).toBe('FileTransport');
    expect(transport.version).toBe('1.0.0');
  });

  it('should write the .eml and the HTML body, and log the path', async () => {
    const transport = new FileTransport({ directory });
    const info = await createTransport(transport as any).sendMail({
      from: 'sender@example.test',
      to: 'ada@example.test',
      subject: 'Hello',
      html: '<p>Hi Ada</p>',
    });

    const files = filesIn(directory);
    expect(files).toHaveLength(2);
    const eml = files.find((f) => f.endsWith('.eml'))!;
    const html = files.find((f) => f.endsWith('.html'))!;
    expect(eml).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[A-Za-z0-9-]+\.eml$/);
    expect(html).toBe(eml.replace(/\.eml$/, '.html'));

    const emlPath = path.join(directory, eml);
    expect(fs.readFileSync(emlPath, 'utf-8')).toContain('Subject: Hello');
    expect(fs.readFileSync(path.join(directory, html), 'utf-8')).toBe(
      '<p>Hi Ada</p>',
    );
    expect(info).toEqual({
      envelope: { from: 'sender@example.test', to: ['ada@example.test'] },
      messageId: expect.any(String),
      accepted: ['ada@example.test'],
      rejected: [],
      response: `Written to ${emlPath}`,
      path: emlPath,
    });
    expect(logSpy).toHaveBeenCalledWith(
      `"Hello" to ada@example.test written to ${emlPath}`,
    );
  });

  it('should skip the HTML file for a text-only email', async () => {
    const transport = new FileTransport({ directory });
    await createTransport(transport as any).sendMail({
      to: 'ada@example.test',
      subject: 'Plain',
      text: 'Hi',
    });

    expect(filesIn(directory)).toEqual([expect.stringMatching(/\.eml$/)]);
  });

  it('should skip the HTML file when html is false', async () => {
    const transport = new FileTransport({ directory, html: false });
    await createTransport(transport as any).sendMail({
      to: 'ada@example.test',
      html: '<p>Hi</p>',
    });

    expect(filesIn(directory)).toEqual([expect.stringMatching(/\.eml$/)]);
  });

  it('should not log when log is false', async () => {
    const transport = new FileTransport({ directory, log: false });
    await createTransport(transport as any).sendMail({
      to: 'ada@example.test',
      text: 'Hi',
    });

    expect(logSpy).not.toHaveBeenCalled();
    expect(filesIn(directory)).toHaveLength(1);
  });

  it('should default to var/mail under the working directory', () => {
    // Not sending, so nothing is written into the repository
    expect((new FileTransport() as any).directory).toBe(
      path.resolve(process.cwd(), 'var/mail'),
    );
  });

  it('should reject when the message cannot be built', async () => {
    const transport = new FileTransport({ directory });

    await expect(
      createTransport(transport as any).sendMail({
        to: 'ada@example.test',
        attachments: [{ path: path.join(tmp, 'missing.txt') }],
      }),
    ).rejects.toThrow();
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('should reject when the directory cannot be created', async () => {
    const blocker = path.join(tmp, 'a-file');
    fs.writeFileSync(blocker, '');
    const transport = new FileTransport({ directory: path.join(blocker, 'x') });

    await expect(
      createTransport(transport as any).sendMail({
        to: 'ada@example.test',
        text: 'Hi',
      }),
    ).rejects.toThrow();
  });
});

describe('transport typing', () => {
  it('should be accepted as a MailerOptions transport', () => {
    const options: MailerOptions[] = [
      { transport: new FileTransport() },
      { transport: new LogTransport() },
      { transport: new TestMailbox() },
    ];
    expect(options).toHaveLength(3);
  });
});
