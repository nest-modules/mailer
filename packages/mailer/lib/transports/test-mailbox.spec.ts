import { createTransport, Transporter } from 'nodemailer';
import { TestMailbox } from './test-mailbox';

class WelcomeMail {}
class ResetMail {}

describe('TestMailbox', () => {
  let mailbox: TestMailbox;

  beforeEach(() => {
    mailbox = new TestMailbox();
  });

  it('should identify itself as a nodemailer transport', () => {
    expect(mailbox.name).toBe('TestMailbox');
    expect(mailbox.version).toBe('1.0.0');
  });

  describe('as a transport', () => {
    let transporter: Transporter;

    beforeEach(() => {
      transporter = createTransport(mailbox as any);
    });

    it('should capture the email and resolve like a real transport', async () => {
      const info = await transporter.sendMail({
        from: 'sender@example.test',
        to: 'ada@example.test',
        subject: 'Hello',
        text: 'Hi Ada',
      });

      expect(mailbox.mails).toHaveLength(1);
      const mail = mailbox.last!;
      expect(info).toEqual({
        envelope: { from: 'sender@example.test', to: ['ada@example.test'] },
        messageId: mail.messageId,
        accepted: ['ada@example.test'],
        rejected: [],
        response: '250 OK: captured by TestMailbox',
        message: Buffer.from(mail.raw),
      });
      expect(mail.subject).toBe('Hello');
      expect(mail.text).toBe('Hi Ada');
      expect(mail.raw).toContain('Subject: Hello');
    });

    it('should keep the emails oldest first and expose the latest', async () => {
      expect(mailbox.last).toBeUndefined();
      await transporter.sendMail({ to: 'a@example.test', subject: 'First' });
      await transporter.sendMail({ to: 'b@example.test', subject: 'Second' });

      expect(mailbox.mails.map((m) => m.subject)).toEqual(['First', 'Second']);
      expect(mailbox.last?.subject).toBe('Second');
    });

    it('should fail the next sends with the queued errors, then recover', async () => {
      const custom = new Error('boom');
      mailbox.failNext().failNext(custom);

      await expect(
        transporter.sendMail({ to: 'a@example.test', subject: 'One' }),
      ).rejects.toThrow('TestMailbox: simulated failure');
      await expect(
        transporter.sendMail({ to: 'a@example.test', subject: 'Two' }),
      ).rejects.toBe(custom);
      await transporter.sendMail({ to: 'a@example.test', subject: 'Three' });

      expect(mailbox.mails.map((m) => m.subject)).toEqual(['Three']);
    });

    it('should reject when the message cannot be built', async () => {
      await expect(
        transporter.sendMail({
          to: 'a@example.test',
          attachments: [{ path: '/definitely/missing/file.txt' }],
        }),
      ).rejects.toThrow();
      expect(mailbox.mails).toHaveLength(0);
    });
  });

  describe('as a stream plugin', () => {
    it('should capture emails while the configured transport still runs', async () => {
      const transporter = createTransport({
        streamTransport: true,
        buffer: true,
      });
      const plugin = mailbox.plugin();
      expect(plugin.step).toBe('stream');
      transporter.use('stream', plugin.plugin as any);

      const info = await transporter.sendMail({
        to: 'ada@example.test',
        subject: 'Streamed',
        text: 'Body',
      });

      // The stream transport's own result is returned unchanged
      expect(Buffer.isBuffer(info.message)).toBe(true);
      expect(info.message.toString()).toContain('Subject: Streamed');
      expect(mailbox.assertSent({ subject: 'Streamed' }).text).toBe('Body');
    });

    it('should fail the send when a failure is queued', async () => {
      const transporter = createTransport({
        streamTransport: true,
        buffer: true,
      });
      transporter.use('stream', mailbox.plugin().plugin as any);
      mailbox.failNext(new Error('plugin failure'));

      await expect(
        transporter.sendMail({ to: 'a@example.test', subject: 'x' }),
      ).rejects.toThrow('plugin failure');
      expect(mailbox.mails).toHaveLength(0);
    });
  });

  describe('queries', () => {
    beforeEach(async () => {
      const transporter = createTransport(mailbox as any);
      await transporter.sendMail({
        to: 'Ada <ADA@example.test>',
        subject: 'Welcome Ada',
        template: 'welcome',
        mailable: WelcomeMail,
        html: '<a href="/verify?token=1">verify</a>',
      } as any);
      await transporter.sendMail({
        to: 'bo@example.test',
        cc: 'carol@example.test',
        bcc: 'dan@example.test',
        subject: 'Reset password',
        template: 'reset',
        mailable: ResetMail,
      } as any);
      await transporter.sendMail({
        to: 'visible@example.test',
        envelope: { from: 'x@example.test', to: ['hidden@example.test'] },
        subject: 'Welcome Ada',
      } as any);
      await transporter.sendMail({ to: 'nosubject@example.test' });
    });

    describe('filter', () => {
      it('should return every email without a query', () => {
        expect(mailbox.filter()).toHaveLength(4);
      });

      it('should match a recipient in to, cc, bcc or the envelope, ignoring case', () => {
        expect(mailbox.filter({ to: 'ada@EXAMPLE.test' })).toHaveLength(1);
        expect(mailbox.filter({ to: 'carol@example.test' })[0].subject).toBe(
          'Reset password',
        );
        expect(mailbox.filter({ to: 'dan@example.test' })).toHaveLength(1);
        expect(mailbox.filter({ to: 'hidden@example.test' })).toHaveLength(1);
        expect(mailbox.filter({ to: 'nobody@example.test' })).toEqual([]);
      });

      it('should match the subject exactly or by RegExp', () => {
        expect(mailbox.filter({ subject: 'Welcome Ada' })).toHaveLength(2);
        expect(mailbox.filter({ subject: 'Welcome' })).toEqual([]);
        expect(mailbox.filter({ subject: /^reset/i })).toHaveLength(1);
        // A missing subject matches as an empty string
        expect(mailbox.filter({ subject: /^$/ })).toHaveLength(1);
      });

      it('should match the template and the mail class', () => {
        expect(mailbox.filter({ template: 'reset' })[0].to).toEqual([
          'bo@example.test',
        ]);
        expect(mailbox.filter({ mail: WelcomeMail })[0].to).toEqual([
          'ADA@example.test',
        ]);
        expect(
          mailbox.filter({ mail: ResetMail, template: 'welcome' }),
        ).toEqual([]);
      });

      it('should match a where predicate', () => {
        const where = jest.fn((mail) => mail.links.length > 0);
        expect(mailbox.filter({ where })).toHaveLength(1);
        expect(where).toHaveBeenCalledTimes(4);
      });
    });

    describe('find', () => {
      it('should return the latest matching email', () => {
        expect(mailbox.find({ subject: 'Welcome Ada' })?.to).toEqual([
          'visible@example.test',
        ]);
        expect(mailbox.find()?.to).toEqual(['nosubject@example.test']);
        expect(mailbox.find({ to: 'nobody@example.test' })).toBeUndefined();
      });
    });

    describe('assertSent', () => {
      it('should return the latest matching email', () => {
        const mail = mailbox.assertSent({ mail: WelcomeMail });
        expect(mail.link('/verify').searchParams.get('token')).toBe('1');
        expect(mailbox.assertSent()).toBe(mailbox.last);
      });

      it('should throw describing the query and what was sent', () => {
        expect(() =>
          mailbox.assertSent({
            to: 'nobody@example.test',
            subject: /nope/,
            mail: WelcomeMail,
            where: () => true,
          }),
        ).toThrow(
          'Expected an email matching {"to":"nobody@example.test","subject":"/nope/","mail":"WelcomeMail","where":"where"}, but none was sent. Sent:\n' +
            '  - "Welcome Ada" to ADA@example.test\n' +
            '  - "Reset password" to bo@example.test, carol@example.test, dan@example.test\n' +
            '  - "Welcome Ada" to visible@example.test\n' +
            '  - "undefined" to nosubject@example.test',
        );
      });

      it('should name anonymous functions generically', () => {
        expect(() =>
          mailbox.assertSent({
            where: (
              () => () =>
                false
            )(),
          }),
        ).toThrow('Expected an email matching {"where":"function"}');
      });
    });

    describe('assertNotSent', () => {
      it('should pass when nothing matches', () => {
        expect(() =>
          mailbox.assertNotSent({ to: 'nobody@example.test' }),
        ).not.toThrow();
      });

      it('should throw listing the matching emails', () => {
        expect(() => mailbox.assertNotSent({ subject: 'Welcome Ada' })).toThrow(
          'Expected no email matching the query, but 2 were sent:\n' +
            '  - "Welcome Ada" to ADA@example.test\n' +
            '  - "Welcome Ada" to visible@example.test',
        );
      });

      it('should throw when any email was sent without a query', () => {
        expect(() => mailbox.assertNotSent()).toThrow('but 4 were sent');
      });
    });

    describe('assertCount', () => {
      it('should pass when the count matches', () => {
        expect(() => mailbox.assertCount(4)).not.toThrow();
        expect(() =>
          mailbox.assertCount(2, { subject: 'Welcome Ada' }),
        ).not.toThrow();
      });

      it('should throw when the count differs', () => {
        expect(() => mailbox.assertCount(1, { subject: /Welcome/ })).toThrow(
          'Expected 1 email(s), but 2 were sent',
        );
      });
    });

    describe('clear', () => {
      it('should forget the emails and the pending failures', async () => {
        mailbox.failNext();
        mailbox.clear();

        expect(mailbox.mails).toHaveLength(0);
        expect(mailbox.last).toBeUndefined();
        await createTransport(mailbox as any).sendMail({
          to: 'a@example.test',
        });
        expect(mailbox.mails).toHaveLength(1);
      });
    });
  });

  describe('on an empty mailbox', () => {
    it('should say nothing was sent', () => {
      expect(() => mailbox.assertSent({ subject: 'Hi' })).toThrow(
        'Expected an email matching {"subject":"Hi"}, but none was sent. Sent:\n  (nothing was sent)',
      );
      expect(() => mailbox.assertNotSent()).not.toThrow();
      expect(() => mailbox.assertCount(0)).not.toThrow();
    });

    it('should describe an email without recipients', async () => {
      await createTransport(mailbox as any).sendMail({
        envelope: { from: 'a@example.test', to: ['b@example.test'] },
        subject: 'Bare',
      } as any);

      expect(() => mailbox.assertNotSent()).toThrow('  - "Bare" to (none)');
    });
  });
});
