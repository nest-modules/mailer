import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { Mailable } from '../interfaces/mailable.interface';
import { loadOutbox } from './load-outbox';
import {
  DEFAULT_MAILER_OUTBOX_CONSUMER,
  DEFAULT_MAILER_OUTBOX_TOPIC,
  MAILER_OUTBOX_OPTIONS,
} from './mailer-outbox.constants';
import {
  createMailerOutboxHandler,
  MAILER_OUTBOX_PACKAGE,
} from './mailer-outbox.handler';
import type {
  MailerOutboxMailables,
  MailerOutboxModuleOptions,
  ResolvedMailerOutboxOptions,
} from './mailer-outbox.interfaces';
import { MailerOutbox } from './mailer-outbox.service';

function indexMailables(
  mailables: MailerOutboxMailables = [],
): Pick<ResolvedMailerOutboxOptions, 'mailables' | 'names'> {
  const entries: Array<[string, unknown]> = Array.isArray(mailables)
    ? mailables.map((mail) => [(mail as { name?: string })?.name ?? '', mail])
    : Object.entries(mailables);
  const byName = new Map<string, Type<Mailable<any>>>();
  const names = new Map<Type<Mailable<any>>, string>();
  for (const [name, mail] of entries) {
    if (typeof mail !== 'function' || !name) {
      throw new TypeError(
        'MailerOutboxModule: every entry of `mailables` must be a named mail class',
      );
    }
    if (byName.has(name)) {
      throw new TypeError(
        `MailerOutboxModule: two mail classes in \`mailables\` are named "${name}": list them as a record ({ name: MailClass }) to tell them apart`,
      );
    }
    byName.set(name, mail as Type<Mailable<any>>);
    names.set(mail as Type<Mailable<any>>, name);
  }
  return { mailables: byName, names };
}

/**
 * Sends emails through the official transactional outbox, `@nestjs/outbox`:
 * `MailerOutbox.add(tx, mail)` records the email in your transaction, and a
 * handler on the topic sends it with `MailerService` once the transaction has
 * committed, with the outbox's retries, dead letters and inbox deduplication.
 *
 * Import `MailerModule` (or `MailerTestModule`) and `OutboxModule.forRoot()` next
 * to it; the outbox's store, retries and relay are configured there.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     MailerModule.forRoot({ transport: process.env.SMTP_URL }),
 *     OutboxModule.forRoot({ retry: { attempts: 10 } }),
 *     MailerOutboxModule.register({ mailables: [WelcomeMail] }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class MailerOutboxModule {
  static register(options: MailerOutboxModuleOptions = {}): DynamicModule {
    const outbox = loadOutbox();
    const resolved: ResolvedMailerOutboxOptions = {
      topic: options.topic ?? DEFAULT_MAILER_OUTBOX_TOPIC,
      consumer: options.consumer ?? DEFAULT_MAILER_OUTBOX_CONSUMER,
      inbox: options.inbox ?? true,
      ...indexMailables(options.mailables),
    };
    const handler = createMailerOutboxHandler(outbox, resolved);

    return {
      module: MailerOutboxModule,
      global: options.global ?? false,
      providers: [
        { provide: MAILER_OUTBOX_OPTIONS, useValue: resolved },
        { provide: MAILER_OUTBOX_PACKAGE, useValue: outbox },
        {
          provide: MailerOutbox,
          useFactory: (official) => new MailerOutbox(official, resolved),
          inject: [outbox.Outbox],
        },
        handler,
      ],
      exports: [MailerOutbox],
    };
  }
}
