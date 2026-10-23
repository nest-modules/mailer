import type { MailMessage } from '@nestjs/mail';
import { Test, TestingModule } from '@nestjs/testing';
import { MailerModule } from '../mailer.module';
import { MailerService } from '../mailer.service';
import { MailerTestModule } from '../testing/mailer-test.module';
import { TestMailbox } from '../transports/test-mailbox';
import { MailerServiceTransport } from './mailer-service.transport';

const RAW =
  'From: app@example.com\r\nTo: ada@example.com\r\nSubject: Interop\r\nMessage-ID: <abc@example.com>\r\n\r\nHello\r\n';

function fakeMessage(): MailMessage {
  return {
    messageId: '<abc@example.com>',
    envelope: { from: 'app@example.com', to: ['ada@example.com'] },
    toMime: () => Buffer.from(RAW),
  } as unknown as MailMessage;
}

function fakeMailerService(sendMail: jest.Mock) {
  return { sendMail } as unknown as MailerService;
}

describe('MailerServiceTransport', () => {
  it('sends the message through MailerService, leaving retries to @nestjs/mail', async () => {
    const sendMail = jest.fn().mockResolvedValue({
      accepted: [{ name: 'Ada', address: 'ada@example.com' }],
      messageId: '<abc@example.com>',
      response: '250 OK',
    });
    const transport = new MailerServiceTransport(fakeMailerService(sendMail));
    const signal = new AbortController().signal;

    const result = await transport.send(fakeMessage(), {
      signal,
      idempotencyKey: 'order-42',
      attempt: 2,
    });

    expect(sendMail).toHaveBeenCalledWith({
      envelope: { from: 'app@example.com', to: ['ada@example.com'] },
      raw: Buffer.from(RAW),
      messageId: '<abc@example.com>',
      transporterName: undefined,
      idempotencyKey: 'order-42',
      signal,
      retry: false,
    });
    expect(result).toEqual({
      accepted: ['ada@example.com'],
      providerMessageId: '<abc@example.com>',
      response: '250 OK',
    });
  });

  it('classifies failures for @nestjs/mail', async () => {
    const permanent = Object.assign(new Error('550 no such user'), {
      responseCode: 550,
    });
    const transient = Object.assign(new Error('timeout'), {
      code: 'ETIMEDOUT',
    });
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(permanent)
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce('not an error');
    const transport = new MailerServiceTransport(fakeMailerService(sendMail));
    const options = { signal: new AbortController().signal, attempt: 1 };

    await expect(transport.send(fakeMessage(), options)).rejects.toBe(
      permanent,
    );
    expect(permanent).toHaveProperty('permanent', true);
    await expect(transport.send(fakeMessage(), options)).rejects.toBe(
      transient,
    );
    expect(transient).toHaveProperty('permanent', false);
    await expect(transport.send(fakeMessage(), options)).rejects.toBe(
      'not an error',
    );
  });

  describe('for', () => {
    it('binds a named transporter', async () => {
      const sendMail = jest.fn().mockResolvedValue({});
      const Named = MailerServiceTransport.for('ses');
      const transport = new Named(fakeMailerService(sendMail));

      expect(transport).toBeInstanceOf(MailerServiceTransport);
      expect(Named.name).toBe('MailerServiceTransport(ses)');
      expect(transport.constructor.name).toBe('MailerServiceTransport(ses)');

      await transport.send(fakeMessage(), {
        signal: new AbortController().signal,
        attempt: 1,
      });
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ transporterName: 'ses', retry: false }),
      );
    });

    it('returns a new class for every name', () => {
      expect(MailerServiceTransport.for('a')).not.toBe(
        MailerServiceTransport.for('a'),
      );
    });
  });

  describe('dependency injection', () => {
    let moduleRef: TestingModule | undefined;

    afterEach(async () => {
      await moduleRef?.close();
      moduleRef = undefined;
    });

    it('injects MailerService into a named transport', async () => {
      const Named = MailerServiceTransport.for('stream');
      moduleRef = await Test.createTestingModule({
        imports: [
          MailerModule.forRoot({
            transport: { jsonTransport: true },
            transports: { stream: { streamTransport: true, buffer: true } },
          }),
        ],
        providers: [Named],
      }).compile();

      const transport = moduleRef.get(Named);
      const result = await transport.send(fakeMessage(), {
        signal: new AbortController().signal,
        attempt: 1,
      });

      expect(transport).toBeInstanceOf(MailerServiceTransport);
      expect(result.providerMessageId).toBe('<abc@example.com>');
    });

    it('delivers through MailerTestModule, captured by TestMailbox', async () => {
      moduleRef = await Test.createTestingModule({
        imports: [MailerTestModule.register()],
        providers: [MailerServiceTransport],
      }).compile();

      const result = await moduleRef
        .get(MailerServiceTransport)
        .send(fakeMessage(), {
          signal: new AbortController().signal,
          attempt: 1,
        });

      const mailbox = moduleRef.get(TestMailbox);
      const captured = mailbox.assertSent({ to: 'ada@example.com' });
      expect(captured.raw).toContain('Subject: Interop');
      expect(captured.envelope).toEqual({
        from: 'app@example.com',
        to: ['ada@example.com'],
      });
      // The stream transport reports no `accepted`: the envelope stands in
      expect(result.accepted).toEqual(['ada@example.com']);
      expect(result.providerMessageId).toBe('<abc@example.com>');
    });
  });
});
