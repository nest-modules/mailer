import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  MailerEvent,
  MailerEventPayload,
} from './interfaces/mailer-events.interface';

/**
 * Service that wraps @nestjs/event-emitter's EventEmitter2.
 * When @nestjs/event-emitter is not installed, events are silently skipped.
 */
@Injectable()
export class MailerEventService {
  private readonly logger = new Logger(MailerEventService.name);
  private eventEmitter: any;

  constructor(@Optional() eventEmitter?: any) {
    if (eventEmitter) {
      this.eventEmitter = eventEmitter;
    }
  }

  /**
   * Emit a mailer event. No-op if EventEmitter2 is not available.
   */
  emit(event: MailerEvent, payload: MailerEventPayload): void {
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
   * Check if the event system is available.
   */
  isAvailable(): boolean {
    return !!this.eventEmitter;
  }
}
