import { Logger } from '@nestjs/common';
import {
  MailerEvent,
  MailerEventPayload,
} from './interfaces/mailer-events.interface';
import { MailerEventService } from './mailer-event.service';

const payload: MailerEventPayload = {
  mailOptions: { to: 'user@example.com', subject: 'Hello' },
  timestamp: new Date('2026-01-01T00:00:00Z'),
};

describe('MailerEventService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('without an event emitter', () => {
    it('reports the event system as unavailable', () => {
      const service = new MailerEventService();
      expect(service.isAvailable()).toBe(false);
    });

    it('silently skips emitting events', () => {
      const service = new MailerEventService();
      expect(() => service.emit(MailerEvent.AFTER_SEND, payload)).not.toThrow();
    });
  });

  describe('with an event emitter', () => {
    it('reports the event system as available', () => {
      const service = new MailerEventService({ emit: jest.fn() });
      expect(service.isAvailable()).toBe(true);
    });

    it('forwards the event name and payload to the emitter', () => {
      const emitter = { emit: jest.fn() };
      const service = new MailerEventService(emitter);

      service.emit(MailerEvent.BEFORE_SEND, payload);

      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledWith(
        MailerEvent.BEFORE_SEND,
        payload,
      );
    });

    it('skips emitting when the injected object has no emit method', () => {
      const service = new MailerEventService({});
      expect(service.isAvailable()).toBe(true);
      expect(() => service.emit(MailerEvent.QUEUED, payload)).not.toThrow();
    });

    it('logs a warning instead of throwing when the emitter fails', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const emitter = {
        emit: jest.fn(() => {
          throw new Error('listener exploded');
        }),
      };
      const service = new MailerEventService(emitter);

      expect(() => service.emit(MailerEvent.SEND_ERROR, payload)).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        'Failed to emit event mailer.send_error: listener exploded',
      );
    });
  });
});
