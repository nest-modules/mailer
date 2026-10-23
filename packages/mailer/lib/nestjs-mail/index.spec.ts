import * as interop from './index';
import { MailerServiceTransport } from './mailer-service.transport';
import {
  classifyError,
  NodemailerMailTransport,
} from './nodemailer-mail.transport';
import { TemplateAdapterEngine } from './template-adapter.engine';

describe('@nestjs-modules/mailer/nestjs-mail', () => {
  it('exports the interop classes and helpers', () => {
    expect(Object.keys(interop).sort()).toEqual([
      'MailerServiceTransport',
      'NodemailerMailTransport',
      'TemplateAdapterEngine',
      'classifyError',
    ]);
    expect(interop.MailerServiceTransport).toBe(MailerServiceTransport);
    expect(interop.NodemailerMailTransport).toBe(NodemailerMailTransport);
    expect(interop.TemplateAdapterEngine).toBe(TemplateAdapterEngine);
    expect(interop.classifyError).toBe(classifyError);
  });
});
