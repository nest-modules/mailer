import * as diagnosticsChannel from 'node:diagnostics_channel';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Observable, Subject } from 'rxjs';
import { MAILER_EVENT_EMITTER } from './constants/mailer.constant';
import {
  MailerEvent,
  MailerEventPayload,
  MailerEventRecord,
} from './interfaces/mailer-events.interface';

/** Anything with an `emit(event, payload)` method, such as `EventEmitter2` */
export interface MailerEventEmitter {
  emit(event: string, payload: unknown): unknown;
}

/** Options that carry secrets, replaced before publishing to diagnostics channels */
const SECRET_OPTIONS = ['auth', 'dkim'] as const;

function redact(
  mailOptions: MailerEventPayload['mailOptions'],
): MailerEventPayload['mailOptions'] {
  if (!mailOptions || !SECRET_OPTIONS.some((key) => key in mailOptions)) {
    return mailOptions;
  }
  const copy: Record<string, unknown> = { ...mailOptions };
  for (const key of SECRET_OPTIONS.filter((k) => k in copy)) {
    copy[key] = '[redacted]';
  }
  return copy as MailerEventPayload['mailOptions'];
}

/** The `node:diagnostics_channel` channel an event is published to */
export function mailerChannelName(event: MailerEvent): string {
  return `nestjs-modules:${event}`;
}

/**
 * Publishes mailer events three ways, all optional for the application:
 * - `events$`, an RxJS stream that needs no extra package;
 * - `@nestjs/event-emitter`'s `EventEmitter2`, when `EventEmitterModule` is imported;
 * - `node:diagnostics_channel` (`nestjs-modules:mailer.after_send`, …), for APM tools.
 */
@Injectable()
export class MailerEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailerEventService.name);
  private eventEmitter?: MailerEventEmitter;
  private readonly subject = new Subject<MailerEventRecord>();

  /** Every mailer event, as it happens */
  readonly events$: Observable<MailerEventRecord> = this.subject.asObservable();

  constructor(
    @Optional()
    @Inject(MAILER_EVENT_EMITTER)
    eventEmitter?: MailerEventEmitter,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    this.eventEmitter = eventEmitter ?? undefined;
  }

  /** Finds `EventEmitter2` when `@nestjs/event-emitter` is installed and its module imported */
  onModuleInit(): void {
    if (this.eventEmitter || !this.moduleRef) return;
    let EventEmitter2: unknown;
    try {
      ({ EventEmitter2 } = require('@nestjs/event-emitter'));
    } catch {
      return;
    }
    try {
      this.eventEmitter = this.moduleRef.get(EventEmitter2 as any, {
        strict: false,
      });
    } catch {
      // Installed but EventEmitterModule isn't imported
    }
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }

  /**
   * Emit a mailer event. A failing EventEmitter2 listener is logged. A
   * subscriber of `events$` or of a diagnostics channel that throws is reported
   * by RxJS or Node as an uncaught exception, like any other subscriber, so
   * keep those subscribers from throwing.
   */
  emit(event: MailerEvent, payload: MailerEventPayload): void {
    // RxJS reports a failing subscriber asynchronously; it never throws here
    this.subject.next({ event, ...payload });

    const channel = diagnosticsChannel.channel(mailerChannelName(event));
    // Node reports a failing subscriber itself; publish never throws. APM
    // tools subscribe here, so credentials and signing keys are left out.
    if (channel.hasSubscribers) {
      channel.publish({
        event,
        ...payload,
        mailOptions: redact(payload.mailOptions),
      });
    }

    if (this.eventEmitter?.emit) {
      try {
        this.eventEmitter.emit(event, payload);
      } catch (error) {
        this.logger.warn(
          `Failed to emit event ${event}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Whether `@nestjs/event-emitter` is wired. `events$` and diagnostics
   * channels work regardless.
   */
  isAvailable(): boolean {
    return !!this.eventEmitter;
  }
}
