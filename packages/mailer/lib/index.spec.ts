import * as entrypoint from './index';
import {
  MailerBatchService,
  MailerEventService,
  MailerHealthIndicator,
  MailerModule,
  MailerQueueModule,
  MailerQueueService,
  MailerService,
  MailerTestModule,
} from './index';

describe('public entrypoint', () => {
  it('should export the injection tokens with their expected values', () => {
    expect(entrypoint.MAILER_OPTIONS).toBe('MAILER_OPTIONS');
    expect(entrypoint.MAILER_QUEUE_OPTIONS).toBe('MAILER_QUEUE_OPTIONS');
    expect(entrypoint.MAILER_TEMPLATE_RESOLVER).toBe(
      'MAILER_TEMPLATE_RESOLVER',
    );
    expect(entrypoint.MAILER_TRANSPORT_FACTORY).toBe(
      'MAILER_TRANSPORT_FACTORY',
    );
  });

  it('should export the MailerEvent enum', () => {
    expect(entrypoint.MailerEvent).toEqual({
      BEFORE_SEND: 'mailer.before_send',
      RETRY: 'mailer.retry',
      FAILOVER: 'mailer.failover',
      SUPPRESSED: 'mailer.suppressed',
      AFTER_SEND: 'mailer.after_send',
      SEND_ERROR: 'mailer.send_error',
      QUEUED: 'mailer.queued',
      QUEUE_COMPLETED: 'mailer.queue.completed',
      QUEUE_FAILED: 'mailer.queue.failed',
    });
  });

  it.each([
    ['MailerModule', MailerModule],
    ['MailerQueueModule', MailerQueueModule],
    ['MailerTestModule', MailerTestModule],
    ['MailerService', MailerService],
    ['MailerBatchService', MailerBatchService],
    ['MailerEventService', MailerEventService],
    ['MailerQueueService', MailerQueueService],
    ['MailerHealthIndicator', MailerHealthIndicator],
  ] as const)('should export the %s class', (name, exported) => {
    expect(typeof exported).toBe('function');
    expect(exported.name).toBe(name);
  });

  it('should resolve every runtime export to a value', () => {
    for (const name of Object.keys(entrypoint)) {
      expect((entrypoint as Record<string, unknown>)[name]).toBeDefined();
    }
  });

  it('should only expose the documented runtime exports', () => {
    // Interfaces and types are erased at runtime and must not leak values
    expect(Object.keys(entrypoint).sort()).toEqual(
      [
        'BrevoTransport',
        'CapturedMail',
        'HttpProviderTransport',
        'MailgunTransport',
        'PostmarkTransport',
        'ResendTransport',
        'SendGridTransport',
        'SesTransport',
        'parseRetryAfter',
        'signV4',
        'LOCAL_TRANSPORT',
        'MailerConnectionError',
        'MailerError',
        'MailerMessageError',
        'MailerProviderError',
        'MailerRecipientsRejectedError',
        'MailerSmtpError',
        'MailerTemplateError',
        'MailerTimeoutError',
        'SafeHtml',
        'html',
        'htmlToText',
        'isSafeHtml',
        'mayHaveBeenDelivered',
        'toMailerError',
        'unsafeHtml',
        'validateMessage',
        'FileTransport',
        'LogTransport',
        'MAILER_EVENT_EMITTER',
        'MAILER_OPTIONS',
        'MAILER_PREVIEW_OPTIONS',
        'MAILER_QUEUE_OPTIONS',
        'MailerPreviewModule',
        'TestMailbox',
        'isTransientError',
        'mailerChannelName',
        'MAILER_TEMPLATE_RESOLVER',
        'MAILER_TRANSPORT_FACTORY',
        'MailerBatchService',
        'MailerEvent',
        'MailerEventService',
        'MailerHealthIndicator',
        'MailerModule',
        'MailerQueueModule',
        'MailerQueueService',
        'MailerService',
        'MailerTestModule',
      ].sort(),
    );
  });
});
