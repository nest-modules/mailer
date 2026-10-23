import {
  MailerConnectionError,
  MailerError,
  MailerMessageError,
  MailerProviderError,
  MailerRecipientsRejectedError,
  MailerSmtpError,
  MailerTemplateError,
  MailerTimeoutError,
  toMailerError,
} from '.';

describe('mailer errors', () => {
  describe('classes', () => {
    it('should name themselves and keep the cause', () => {
      const cause = new Error('socket');
      const error = new MailerConnectionError('down', {
        code: 'ECONNECTION',
        cause,
      });
      expect(error).toBeInstanceOf(MailerError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('MailerConnectionError');
      expect(error.cause).toBe(cause);
      expect(error.permanent).toBe(false);
      expect(error.code).toBe('ECONNECTION');
      expect(new MailerConnectionError('x').cause).toBeUndefined();
      expect(new MailerError('x', { permanent: true })).not.toHaveProperty(
        'code',
      );
    });

    it('should mark SMTP replies by their code and read the enhanced code', () => {
      const rejected = new MailerSmtpError('nope', {
        responseCode: 550,
        response: '550 5.1.1 <ada@x.com>: user unknown',
        command: 'RCPT TO',
      });
      expect(rejected).toMatchObject({
        permanent: true,
        responseCode: 550,
        enhancedCode: '5.1.1',
        command: 'RCPT TO',
      });
      const greylisted = new MailerSmtpError('later', {
        responseCode: 451,
        response: 'try again later',
      });
      expect(greylisted.permanent).toBe(false);
      expect(greylisted).not.toHaveProperty('enhancedCode');
      expect(
        new MailerSmtpError('x', { responseCode: 421 }),
      ).not.toHaveProperty('response');
    });

    it('should list the rejected recipients', () => {
      const error = new MailerRecipientsRejectedError('rejected', {
        responseCode: 550,
        rejected: ['a@x.com'],
      });
      expect(error).toBeInstanceOf(MailerSmtpError);
      expect(error.rejected).toEqual(['a@x.com']);
    });

    it('should describe timeouts, templates and invalid messages', () => {
      expect(new MailerTimeoutError('slow', { timeoutMs: 5 })).toMatchObject({
        permanent: false,
        code: 'ETIMEDOUT',
        timeoutMs: 5,
      });
      expect(new MailerTimeoutError('slow')).not.toHaveProperty('timeoutMs');
      expect(
        new MailerTemplateError('missing', { template: 'welcome' }),
      ).toMatchObject({
        permanent: true,
        code: 'ETEMPLATE',
        template: 'welcome',
      });
      expect(new MailerTemplateError('missing')).not.toHaveProperty('template');
      expect(new MailerMessageError('bad', { field: 'to' })).toMatchObject({
        permanent: true,
        code: 'EMESSAGE',
        field: 'to',
      });
    });

    it.each([
      [400, true],
      [401, true],
      [408, false],
      [409, false],
      [422, true],
      [429, false],
      [500, false],
      [503, false],
    ])(
      'should mark provider status %d as permanent=%p',
      (status, permanent) => {
        expect(
          new MailerProviderError('x', { provider: 'resend', status })
            .permanent,
        ).toBe(permanent);
      },
    );

    it('should keep provider details and honor an explicit permanent flag', () => {
      const error = new MailerProviderError('slow down', {
        provider: 'resend',
        status: 429,
        providerCode: 'rate_limit_exceeded',
        retryAfterMs: 2000,
        permanent: true,
      });
      expect(error).toMatchObject({
        provider: 'resend',
        status: 429,
        providerCode: 'rate_limit_exceeded',
        code: 'rate_limit_exceeded',
        retryAfterMs: 2000,
        permanent: true,
      });
      const plain = new MailerProviderError('x', {
        provider: 'ses',
        status: 500,
      });
      expect(plain).not.toHaveProperty('providerCode');
      expect(plain).not.toHaveProperty('retryAfterMs');
    });
  });

  describe('toMailerError', () => {
    const nodemailerError = (
      props: Record<string, unknown>,
      message = 'failed',
    ) => Object.assign(new Error(message), props);

    it('should return a MailerError as is', () => {
      const error = new MailerTimeoutError('slow');
      expect(toMailerError(error)).toBe(error);
    });

    it('should wrap SMTP replies keeping their fields', () => {
      const source = nodemailerError({
        code: 'EENVELOPE',
        responseCode: 550,
        response: '550 5.7.1 relay denied',
        command: 'RCPT TO',
        rejectedErrors: [],
      });
      const typed = toMailerError(source);
      expect(typed).toBeInstanceOf(MailerSmtpError);
      expect(typed).not.toBeInstanceOf(MailerRecipientsRejectedError);
      expect(typed).toMatchObject({
        message: 'failed',
        code: 'EENVELOPE',
        responseCode: 550,
        enhancedCode: '5.7.1',
        command: 'RCPT TO',
        rejectedErrors: [],
        permanent: true,
        cause: source,
      });
      expect(typed.stack).toContain('[cause]');
    });

    it('should report refused recipients', () => {
      const typed = toMailerError(
        nodemailerError({
          code: 'EENVELOPE',
          responseCode: 550,
          rejected: ['a@x.com'],
        }),
      );
      expect(typed).toBeInstanceOf(MailerRecipientsRejectedError);
      expect((typed as MailerRecipientsRejectedError).rejected).toEqual([
        'a@x.com',
      ]);
    });

    it('should ignore SMTP fields of the wrong type', () => {
      const typed = toMailerError(
        nodemailerError({
          responseCode: 421,
          response: 42,
          command: null,
          code: 7,
        }),
      );
      expect(typed).toBeInstanceOf(MailerSmtpError);
      // Not taken as the SMTP command, but still there for existing checks
      expect((typed as any).command).toBeNull();
      expect(typed.code).toBeUndefined();
      // The original value is still there for existing checks
      expect((typed as any).response).toBe(42);
    });

    it('should not take an empty rejected list as refused recipients', () => {
      const typed = toMailerError(
        nodemailerError({ code: 'EENVELOPE', responseCode: 550, rejected: [] }),
      );
      expect(typed).not.toBeInstanceOf(MailerRecipientsRejectedError);
    });

    it.each(['ETIMEDOUT', 'ESOCKETTIMEDOUT'])(
      'should wrap %s as a timeout',
      (code) => {
        expect(toMailerError(nodemailerError({ code }))).toBeInstanceOf(
          MailerTimeoutError,
        );
      },
    );

    it('should wrap network failures as connection errors', () => {
      const typed = toMailerError(nodemailerError({ code: 'ECONNREFUSED' }));
      expect(typed).toBeInstanceOf(MailerConnectionError);
      expect(typed.permanent).toBe(false);
    });

    it('should treat certificate failures as permanent', () => {
      expect(
        toMailerError(
          nodemailerError({ code: 'ETLS' }, 'self signed certificate'),
        ).permanent,
      ).toBe(true);
      expect(
        toMailerError(nodemailerError({ code: 'ETLS' }, 'handshake')).permanent,
      ).toBe(false);
    });

    it('should wrap anything else by its classification', () => {
      expect(toMailerError(nodemailerError({ code: 'EAUTH' }))).toMatchObject({
        permanent: true,
        code: 'EAUTH',
      });
      expect(toMailerError(new TypeError('bug')).permanent).toBe(true);
      const fromString = toMailerError('boom');
      expect(fromString.message).toBe('boom');
      expect(fromString.permanent).toBe(false);
      expect(toMailerError(undefined).message).toBe('Unknown error');
      expect(toMailerError(null).message).toBe('Unknown error');
    });

    it('should keep a provider Retry-After', () => {
      expect(
        toMailerError(nodemailerError({ status: 429, retryAfterMs: 1500 })),
      ).toMatchObject({ retryAfterMs: 1500, permanent: false });
      expect(
        toMailerError(nodemailerError({ status: 429 })),
      ).not.toHaveProperty('retryAfterMs');
    });

    it('should not shadow fields the typed error defines', () => {
      const typed = toMailerError(
        nodemailerError({
          responseCode: 550,
          response: 'r',
          rejected: ['a@x.com'],
        }),
      );
      expect((typed as any).response).toBe('r');
      expect((typed as any).rejected).toEqual(['a@x.com']);
    });

    it('should keep its own stack for errors without one', () => {
      const source = { code: 'ECONNECTION', message: 'x' };
      expect(toMailerError(source).stack).not.toContain('[cause]');
    });
  });
});
