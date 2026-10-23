import * as diagnosticsChannel from 'node:diagnostics_channel';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitterModule, OnEvent } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { MAILER_EVENT_EMITTER } from './constants/mailer.constant';
import {
  MailerEvent,
  MailerEventPayload,
} from './interfaces/mailer-events.interface';
import { MailerEventService, mailerChannelName } from './mailer-event.service';

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
      const service = new MailerEventService({} as any);
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

  describe('events$', () => {
    it('should stream every event with its name', () => {
      const service = new MailerEventService();
      const received: unknown[] = [];
      service.events$.subscribe((record) => received.push(record));

      service.emit(MailerEvent.AFTER_SEND, payload);

      expect(received).toEqual([{ event: MailerEvent.AFTER_SEND, ...payload }]);
    });

    it('should complete on module destroy', () => {
      const service = new MailerEventService();
      const complete = jest.fn();
      service.events$.subscribe({ complete });

      service.onModuleDestroy();

      expect(complete).toHaveBeenCalled();
    });
  });

  describe('diagnostics_channel', () => {
    it('should leave credentials and signing keys out of channel messages', () => {
      const channel = mailerChannelName(MailerEvent.BEFORE_SEND);
      const listener = jest.fn();
      const emitter = { emit: jest.fn() };
      const mailOptions = {
        to: 'a@x.com',
        auth: { user: 'u', accessToken: 'secret' },
        dkim: { domainName: 'x.com', keySelector: 's', privateKey: 'KEY' },
      } as any;
      diagnosticsChannel.subscribe(channel, listener);
      try {
        new MailerEventService(emitter).emit(MailerEvent.BEFORE_SEND, {
          mailOptions,
          timestamp: payload.timestamp,
        });
      } finally {
        diagnosticsChannel.unsubscribe(channel, listener);
      }

      expect(listener.mock.calls[0][0].mailOptions).toEqual({
        to: 'a@x.com',
        auth: '[redacted]',
        dkim: '[redacted]',
      });
      // In-process listeners still get the options as they are
      expect(emitter.emit.mock.calls[0][1].mailOptions).toBe(mailOptions);
    });

    it('should publish to the event channel when someone subscribes', () => {
      const channel = mailerChannelName(MailerEvent.AFTER_SEND);
      expect(channel).toBe('nestjs-modules:mailer.after_send');
      const listener = jest.fn();
      diagnosticsChannel.subscribe(channel, listener);
      try {
        new MailerEventService().emit(MailerEvent.AFTER_SEND, payload);
      } finally {
        diagnosticsChannel.unsubscribe(channel, listener);
      }

      expect(listener).toHaveBeenCalledWith(
        { event: MailerEvent.AFTER_SEND, ...payload },
        channel,
      );
    });
  });

  describe('EventEmitter2 discovery', () => {
    @Injectable()
    class Listener {
      readonly received: MailerEventPayload[] = [];

      @OnEvent(MailerEvent.AFTER_SEND)
      onSent(event: MailerEventPayload) {
        this.received.push(event);
      }
    }

    it('should find EventEmitter2 when EventEmitterModule is imported', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [MailerEventService, Listener],
      }).compile();
      await moduleRef.init();

      const service = moduleRef.get(MailerEventService);
      expect(service.isAvailable()).toBe(true);
      service.emit(MailerEvent.AFTER_SEND, payload);

      expect(moduleRef.get(Listener).received).toEqual([payload]);
      await moduleRef.close();
    });

    it('should stay without emitter when EventEmitterModule is not imported', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [MailerEventService],
      }).compile();
      await moduleRef.init();

      expect(moduleRef.get(MailerEventService).isAvailable()).toBe(false);
      await moduleRef.close();
    });

    it('should keep an emitter given through MAILER_EVENT_EMITTER', async () => {
      const emitter = { emit: jest.fn() };
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          MailerEventService,
          { provide: MAILER_EVENT_EMITTER, useValue: emitter },
        ],
      }).compile();
      await moduleRef.init();

      moduleRef.get(MailerEventService).emit(MailerEvent.QUEUED, payload);
      expect(emitter.emit).toHaveBeenCalledWith(MailerEvent.QUEUED, payload);
      await moduleRef.close();
    });

    it('should do nothing without a module reference', () => {
      const service = new MailerEventService();
      service.onModuleInit();
      expect(service.isAvailable()).toBe(false);
    });

    it('should skip discovery when @nestjs/event-emitter is not installed', () => {
      jest.isolateModules(() => {
        jest.doMock('@nestjs/event-emitter', () => {
          throw new Error("Cannot find module '@nestjs/event-emitter'");
        });
        const {
          MailerEventService: Isolated,
        } = require('./mailer-event.service');
        const moduleRef = { get: jest.fn() };
        const service = new Isolated(undefined, moduleRef);

        service.onModuleInit();

        expect(service.isAvailable()).toBe(false);
        expect(moduleRef.get).not.toHaveBeenCalled();
      });
      jest.dontMock('@nestjs/event-emitter');
    });
  });
});
