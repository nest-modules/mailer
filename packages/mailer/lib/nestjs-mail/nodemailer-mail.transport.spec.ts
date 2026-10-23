import type { MailMessage, MailTransportSendOptions } from '@nestjs/mail';
import { Transporter } from 'nodemailer';
import {
  classifyError,
  NodemailerMailTransport,
  toTransportResult,
} from './nodemailer-mail.transport';

/** What a transport reads from `@nestjs/mail`'s `MailMessage` */
function fakeMessage(raw = 'Subject: Hi\r\n\r\nHello\r\n'): MailMessage {
  return {
    messageId: '<abc@example.com>',
    envelope: { from: 'app@example.com', to: ['ada@example.com'] },
    toMime: () => Buffer.from(raw),
  } as unknown as MailMessage;
}

function sendOptions(
  overrides: Partial<MailTransportSendOptions> = {},
): MailTransportSendOptions {
  return {
    signal: new AbortController().signal,
    attempt: 1,
    ...overrides,
  };
}

function fakeTransporter(overrides: Record<string, unknown> = {}) {
  return {
    sendMail: jest.fn().mockResolvedValue({
      accepted: ['ada@example.com'],
      messageId: '<abc@example.com>',
      response: '250 OK',
    }),
    ...overrides,
  } as unknown as Transporter & { sendMail: jest.Mock };
}

describe('NodemailerMailTransport', () => {
  describe('constructor', () => {
    it('creates a transporter from nodemailer transport options', async () => {
      const transport = new NodemailerMailTransport({
        streamTransport: true,
        buffer: true,
      });

      expect(typeof transport.transporter.sendMail).toBe('function');
      const info = await transport.transporter.sendMail({
        envelope: { from: 'a@example.com', to: ['b@example.com'] },
        raw: 'Subject: x\r\n\r\ny\r\n',
      });
      expect(info.message.toString()).toContain('Subject: x');
    });

    it('accepts a transport URL', () => {
      const transport = new NodemailerMailTransport('smtp://localhost:2525');
      expect(transport.transporter.options).toMatchObject({
        host: 'localhost',
        port: 2525,
      });
    });

    it('leaves a missing transport to nodemailer, which rejects it', () => {
      expect(() => new NodemailerMailTransport(undefined as never)).toThrow(
        TypeError,
      );
    });

    it('uses an existing Transporter as is', () => {
      const transporter = fakeTransporter();
      expect(new NodemailerMailTransport(transporter).transporter).toBe(
        transporter,
      );
    });
  });

  describe('send', () => {
    it('forwards the raw MIME and the envelope, and translates the result', async () => {
      const transporter = fakeTransporter();
      const transport = new NodemailerMailTransport(transporter);

      const result = await transport.send(fakeMessage(), sendOptions());

      expect(transporter.sendMail).toHaveBeenCalledWith({
        envelope: { from: 'app@example.com', to: ['ada@example.com'] },
        raw: Buffer.from('Subject: Hi\r\n\r\nHello\r\n'),
        messageId: '<abc@example.com>',
      });
      expect(result).toEqual({
        accepted: ['ada@example.com'],
        providerMessageId: '<abc@example.com>',
        response: '250 OK',
      });
    });

    it('delivers the exact MIME through a real stream transport', async () => {
      const transport = new NodemailerMailTransport({
        streamTransport: true,
        buffer: true,
      });
      const sendMail = jest.spyOn(transport.transporter, 'sendMail');

      const result = await transport.send(
        fakeMessage(
          'Subject: Stream\r\nMessage-ID: <abc@example.com>\r\n\r\nBody\r\n',
        ),
        sendOptions(),
      );

      const info = await sendMail.mock.results[0].value;
      expect(info.message.toString()).toContain('Subject: Stream');
      expect(info.envelope).toEqual({
        from: 'app@example.com',
        to: ['ada@example.com'],
      });
      expect(result.accepted).toEqual(['ada@example.com']);
      expect(result.providerMessageId).toBe('<abc@example.com>');
    });

    it('rejects with the reason when the signal aborts', async () => {
      const transporter = fakeTransporter({
        sendMail: jest.fn(() => new Promise(() => {})),
      });
      const transport = new NodemailerMailTransport(transporter);
      const controller = new AbortController();
      const reason = new Error('cancelled');

      const sending = transport.send(
        fakeMessage(),
        sendOptions({ signal: controller.signal }),
      );
      controller.abort(reason);

      await expect(sending).rejects.toBe(reason);
    });

    it('rejects right away when the signal is already aborted', async () => {
      const transporter = fakeTransporter();
      const transport = new NodemailerMailTransport(transporter);
      const controller = new AbortController();
      controller.abort(new Error('too late'));

      await expect(
        transport.send(
          fakeMessage(),
          sendOptions({ signal: controller.signal }),
        ),
      ).rejects.toThrow('too late');
    });

    it('works without a signal', async () => {
      const transporter = fakeTransporter();
      const transport = new NodemailerMailTransport(transporter);

      await expect(
        transport.send(fakeMessage(), {
          attempt: 1,
        } as MailTransportSendOptions),
      ).resolves.toMatchObject({ accepted: ['ada@example.com'] });
    });

    it('marks a permanent SMTP failure as permanent', async () => {
      const error = Object.assign(new Error('550 Mailbox unavailable'), {
        responseCode: 550,
      });
      const transport = new NodemailerMailTransport(
        fakeTransporter({ sendMail: jest.fn().mockRejectedValue(error) }),
      );

      await expect(transport.send(fakeMessage(), sendOptions())).rejects.toBe(
        error,
      );
      expect(error).toHaveProperty('permanent', true);
    });

    it('marks a connection failure as transient', async () => {
      const error = Object.assign(new Error('Connection refused'), {
        code: 'ECONNECTION',
      });
      const transport = new NodemailerMailTransport(
        fakeTransporter({ sendMail: jest.fn().mockRejectedValue(error) }),
      );

      await expect(transport.send(fakeMessage(), sendOptions())).rejects.toBe(
        error,
      );
      expect(error).toHaveProperty('permanent', false);
    });
  });

  describe('verify', () => {
    it('is true when the transporter verifies', async () => {
      const transport = new NodemailerMailTransport(
        fakeTransporter({ verify: jest.fn().mockResolvedValue(true) }),
      );
      await expect(transport.verify()).resolves.toBe(true);
    });

    it('is false when verification fails', async () => {
      const transport = new NodemailerMailTransport(
        fakeTransporter({
          verify: jest.fn().mockRejectedValue(new Error('EAUTH')),
        }),
      );
      await expect(transport.verify()).resolves.toBe(false);
    });

    it('is true when the transporter cannot verify', async () => {
      const transport = new NodemailerMailTransport(fakeTransporter());
      await expect(transport.verify()).resolves.toBe(true);
    });
  });

  describe('close', () => {
    it('closes the transporter', () => {
      const close = jest.fn();
      new NodemailerMailTransport(fakeTransporter({ close })).close();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the transporter has no close()', () => {
      expect(() =>
        new NodemailerMailTransport(fakeTransporter()).close(),
      ).not.toThrow();
    });
  });
});

describe('classifyError', () => {
  it('marks SMTP 5xx replies as permanent', () => {
    const error = classifyError({ responseCode: 550 });
    expect(error).toEqual({ responseCode: 550, permanent: true });
  });

  it('marks SMTP 4xx replies as transient', () => {
    expect(classifyError({ responseCode: 421 })).toHaveProperty(
      'permanent',
      false,
    );
  });

  it('marks network errors as transient', () => {
    expect(classifyError({ code: 'ECONNECTION' })).toHaveProperty(
      'permanent',
      false,
    );
  });

  it('leaves an error that already says whether it is permanent untouched', () => {
    const transient = { responseCode: 550, permanent: false };
    expect(classifyError(transient)).toBe(transient);
    expect(transient.permanent).toBe(false);

    const permanent = { code: 'ECONNECTION', permanent: true };
    expect(classifyError(permanent)).toEqual({
      code: 'ECONNECTION',
      permanent: true,
    });
  });

  it('passes rejections that are not objects through', () => {
    expect(classifyError('boom')).toBe('boom');
    expect(classifyError(null)).toBeNull();
    expect(classifyError(undefined)).toBeUndefined();
  });

  it('defines `permanent` as an enumerable, read-only property', () => {
    const error = classifyError(new Error('x')) as { permanent: boolean };
    expect(Object.keys(error)).toContain('permanent');
    expect(() => {
      error.permanent = false;
    }).toThrow(TypeError);
  });
});

describe('toTransportResult', () => {
  it('takes accepted addresses given as strings', () => {
    expect(
      toTransportResult({
        accepted: ['a@example.com', 'b@example.com'],
        messageId: '<id@example.com>',
        response: '250 OK',
      }),
    ).toEqual({
      accepted: ['a@example.com', 'b@example.com'],
      providerMessageId: '<id@example.com>',
      response: '250 OK',
    });
  });

  it('takes accepted addresses given as objects', () => {
    expect(
      toTransportResult({
        accepted: [{ name: 'A', address: 'a@example.com' }, 'b@example.com'],
      }).accepted,
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('leaves accepted undefined when the transport does not report it', () => {
    expect(toTransportResult({ messageId: '<id@example.com>' })).toEqual({
      accepted: undefined,
      providerMessageId: '<id@example.com>',
      response: undefined,
    });
  });

  it('copes with a transport that resolves nothing', () => {
    expect(toTransportResult(undefined)).toEqual({
      accepted: undefined,
      providerMessageId: undefined,
      response: undefined,
    });
  });
});
