import { Type } from '@nestjs/common';
import { MailerPlugin } from '../interfaces/mailer-options.interface';
import {
  buildRaw,
  CapturedMail,
  LOCAL_TRANSPORT,
  NodemailerMail,
} from './captured-mail';

/** What `TestMailbox#find()` and `assertSent()` match on; every given field must match */
export interface MailQuery {
  /** A recipient in to, cc or bcc */
  to?: string;
  subject?: string | RegExp;
  template?: string;
  /** The mail class passed to `send(MailClass)` */
  mail?: Type<unknown>;
  /** Any other condition */
  where?: (mail: CapturedMail) => boolean;
}

function matches(mail: CapturedMail, query: MailQuery): boolean {
  if (query.to !== undefined) {
    const wanted = query.to.toLowerCase();
    const recipients = [
      ...mail.to,
      ...mail.cc,
      ...mail.bcc,
      ...mail.envelope.to,
    ];
    if (!recipients.some((address) => address.toLowerCase() === wanted))
      return false;
  }
  if (query.subject !== undefined) {
    const subject = mail.subject ?? '';
    const ok =
      typeof query.subject === 'string'
        ? subject === query.subject
        : query.subject.test(subject);
    if (!ok) return false;
  }
  if (query.template !== undefined && mail.template !== query.template)
    return false;
  if (query.mail !== undefined && mail.mailable !== query.mail) return false;
  if (query.where && !query.where(mail)) return false;
  return true;
}

function describe(mail: CapturedMail): string {
  return `  - "${mail.subject}" to ${[...mail.to, ...mail.cc, ...mail.bcc].join(', ') || '(none)'}`;
}

/**
 * A nodemailer transport that keeps emails in memory instead of sending them,
 * with assertions for tests. `MailerTestModule` provides one.
 *
 * @example
 * ```typescript
 * const mail = mailbox.assertSent({ to: 'ada@example.com', mail: WelcomeMail });
 * expect(mail.link('/verify').searchParams.get('token')).toBeDefined();
 * ```
 */
export class TestMailbox {
  readonly name = 'TestMailbox';
  readonly [LOCAL_TRANSPORT] = true;
  readonly version = '1.0.0';
  private readonly captured: CapturedMail[] = [];
  private readonly failures: unknown[] = [];

  /** Every captured email, oldest first */
  get mails(): readonly CapturedMail[] {
    return this.captured;
  }

  /** The most recent email, if any */
  get last(): CapturedMail | undefined {
    return this.captured[this.captured.length - 1];
  }

  /**
   * A nodemailer `stream` plugin that captures emails while the configured
   * transport still runs, so its result is unchanged.
   */
  plugin(): MailerPlugin {
    return {
      step: 'stream',
      plugin: (mail, callback) => {
        this.capture(mail).then(
          () => callback(),
          (err) => callback(err),
        );
      },
    };
  }

  private async capture(mail: NodemailerMail): Promise<CapturedMail> {
    if (this.failures.length > 0) throw this.failures.shift();
    const captured = new CapturedMail(mail, await buildRaw(mail));
    this.captured.push(captured);
    return captured;
  }

  /** @internal Called by nodemailer */
  send(
    mail: NodemailerMail,
    // `any`: assignable to the callback types of every nodemailer major
    callback: (err: any, info?: any) => void,
  ): void {
    this.capture(mail).then(
      (captured) =>
        callback(null, {
          envelope: captured.envelope,
          messageId: captured.messageId,
          accepted: captured.envelope.to,
          rejected: [],
          response: '250 OK: captured by TestMailbox',
          message: Buffer.from(captured.raw),
        }),
      (err) => callback(err),
    );
  }

  /** Makes the next send fail with `error`; call it again to queue more failures */
  failNext(error: unknown = new Error('TestMailbox: simulated failure')): this {
    this.failures.push(error);
    return this;
  }

  filter(query: MailQuery = {}): CapturedMail[] {
    return this.captured.filter((mail) => matches(mail, query));
  }

  find(query: MailQuery = {}): CapturedMail | undefined {
    return this.filter(query).pop();
  }

  /** Returns the latest email matching `query`, or throws listing what was sent */
  assertSent(query: MailQuery = {}): CapturedMail {
    const found = this.find(query);
    if (found) return found;
    const sent =
      this.captured.map(describe).join('\n') || '  (nothing was sent)';
    throw new Error(
      `Expected an email matching ${JSON.stringify(query, (_, value) =>
        typeof value === 'function'
          ? value.name || 'function'
          : value instanceof RegExp
            ? String(value)
            : value,
      )}, but none was sent. Sent:\n${sent}`,
    );
  }

  /** Throws when any email matching `query` (by default: any email) was sent */
  assertNotSent(query: MailQuery = {}): void {
    const found = this.filter(query);
    if (found.length > 0) {
      throw new Error(
        `Expected no email matching the query, but ${found.length} were sent:\n${found
          .map(describe)
          .join('\n')}`,
      );
    }
  }

  /** Asserts exactly `count` emails (matching `query`) were sent */
  assertCount(count: number, query: MailQuery = {}): void {
    const found = this.filter(query).length;
    if (found !== count) {
      throw new Error(`Expected ${count} email(s), but ${found} were sent`);
    }
  }

  /** Forgets every captured email and pending failure */
  clear(): void {
    this.captured.length = 0;
    this.failures.length = 0;
  }
}
