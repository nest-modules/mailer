import type {
  MailMessage,
  MailTemplateEngine,
  MailTransport,
  MailTransportSendOptions,
} from '@nestjs/mail';
import { MailerServiceTransport } from './mailer-service.transport';
import type {
  MailMessageLike,
  MailTemplateEngineLike,
  MailTransportLike,
  MailTransportSendOptionsLike,
} from './nestjs-mail.types';
import { NodemailerMailTransport } from './nodemailer-mail.transport';
import { TemplateAdapterEngine } from './template-adapter.engine';

/** Compiles only when `T` is assignable to `U` */
type Assignable<T, U> = T extends U ? true : false;
const check = <T extends true>(value: T) => value;

describe('@nestjs/mail structural types', () => {
  it('should accept the real classes where @nestjs/mail expects them', () => {
    // Type-level checks: they fail the build if the contracts drift apart
    check<Assignable<MailMessage, MailMessageLike>>(true);
    check<Assignable<MailTransportSendOptions, MailTransportSendOptionsLike>>(
      true,
    );
    check<Assignable<NodemailerMailTransport, MailTransport>>(true);
    check<Assignable<MailerServiceTransport, MailTransport>>(true);
    check<Assignable<TemplateAdapterEngine, MailTemplateEngine>>(true);
    check<Assignable<MailTransport, MailTransportLike>>(true);
    check<Assignable<MailTemplateEngine, MailTemplateEngineLike>>(true);
    expect(true).toBe(true);
  });
});
