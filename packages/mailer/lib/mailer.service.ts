/** Dependencies **/

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SentMessageInfo, Transporter } from 'nodemailer';
/** Constants **/
import {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
} from './constants/mailer.constant';
import {
  MailerTemplateError,
  MailerTimeoutError,
} from './errors/mailer.errors';
import { toMailerError } from './errors/to-mailer-error';
/** Interfaces **/
import {
  Mailable,
  MailableContent,
  MailableData,
  MailableSendOptions,
  RenderedMail,
} from './interfaces/mailable.interface';
import { MailerEvent } from './interfaces/mailer-events.interface';
import {
  MailerOptions,
  TransportType,
} from './interfaces/mailer-options.interface';
import { MailerTransportFactory as IMailerTransportFactory } from './interfaces/mailer-transport-factory.interface';
import { ISendMailOptions } from './interfaces/send-mail-options.interface';
import { TemplateAdapter } from './interfaces/template-adapter.interface';
import { MailerEventService } from './mailer-event.service';
import { MailerTransportFactory } from './mailer-transport.factory';
import { LOCAL_TRANSPORT } from './transports/captured-mail';
import { compileTemplate } from './utils/compile-template';
import { htmlToText } from './utils/html-to-text';
import { interpolate } from './utils/interpolate';
import { isWithinDirectory } from './utils/is-within-directory';
import { LOCALE_PATTERN, templateExists } from './utils/localized-template';
import {
  applyIntercept,
  applySuppression,
  applyUnsubscribe,
  messageIdFor,
  parseAddresses,
  recipientsOf,
} from './utils/recipients';
import {
  abortReason,
  canFailover,
  isTransientError,
  mayHaveBeenDelivered,
  ResolvedRetry,
  raceSignal,
  resolveRetry,
  retryDelay,
  sleep,
} from './utils/retry';
import { validateMessage } from './utils/validate-message';

type PreviewOptions = Exclude<MailerOptions['preview'], boolean | undefined>;

/** Options that steer delivery and are not handed to nodemailer */
type DeliveryControl = 'retry' | 'signal' | 'failover';

/** The result of a send whose recipients were all suppressed */
export interface SuppressedMessageInfo {
  messageId: undefined;
  accepted: [];
  rejected: [];
  suppressed: string[];
  response: string;
}

/** Merges nodemailer headers, `override` winning, in either the object or the array format */
function mergeHeaders(
  base: ISendMailOptions['headers'],
  override: ISendMailOptions['headers'],
): ISendMailOptions['headers'] {
  if (!base) return override;
  if (!override) return base;
  if (!Array.isArray(base) && !Array.isArray(override)) {
    return { ...base, ...override };
  }
  const toArray = (headers: NonNullable<ISendMailOptions['headers']>) =>
    Array.isArray(headers)
      ? headers
      : Object.entries(headers).map(([key, value]) => ({
          key,
          value: value as string,
        }));
  const overridden = toArray(override);
  const keys = new Set(overridden.map((h) => h.key.toLowerCase()));
  return [
    ...toArray(base).filter((h) => !keys.has(h.key.toLowerCase())),
    ...overridden,
  ];
}

/** `SafeHtml` (this library's or `@nestjs/mail`'s) or any object with its own `toString()` */
function isHtmlObject(value: unknown): value is { toString(): string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Buffer.isBuffer(value) &&
    typeof value.toString === 'function' &&
    value.toString !== Object.prototype.toString
  );
}

function bodyToString(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf-8');
  return undefined;
}

/** Fill in `open: { wait: false }` without overriding user-provided values */
function withPreviewDefaults(preview: true | PreviewOptions): PreviewOptions {
  if (preview === true) return { open: { wait: false } };
  const { open } = preview;
  if (open === undefined) return { ...preview, open: { wait: false } };
  if (typeof open === 'object' && open !== null) {
    return { ...preview, open: { ...open, wait: open.wait ?? false } };
  }
  return preview;
}

@Injectable()
export class MailerService implements OnModuleDestroy {
  private transporter!: Transporter;
  private transporters = new Map<string, Transporter>();
  private templateAdapter?: TemplateAdapter;
  private initTemplateAdapter(
    templateAdapter: TemplateAdapter | undefined,
    transporter: Transporter,
  ): void {
    if (templateAdapter) {
      transporter.use('compile', (mail, callback) => {
        // Nothing to render: inline HTML, a raw MIME message, or a text-only email
        const data = mail.data as ISendMailOptions;
        if (
          data.html ||
          data.raw ||
          (!data.template && data.text !== undefined)
        ) {
          return callback();
        }

        return templateAdapter.compile(
          mail,
          (error?: unknown) =>
            callback(
              error
                ? (new MailerTemplateError(
                    `Template "${data.template}" failed: ${error instanceof Error ? error.message : String(error)}`,
                    { template: data.template, cause: error },
                  ) as any)
                : undefined,
            ),
          this.mailerOptions,
        );
      });

      let previewEmail;

      try {
        previewEmail = require('preview-email');
      } catch (_err) {
        this.mailerLogger.warn(
          'preview-email is not installed. This is an optional dependency. Install it if you want to preview emails in the development environment. You can install it using npm (npm install preview-email), yarn (yarn add preview-email), or pnpm (pnpm add preview-email).',
        );
      }

      if (this.mailerOptions.preview) {
        transporter.use('stream', (mail, callback) => {
          if (typeof previewEmail !== 'undefined') {
            return previewEmail(mail.data, this.mailerOptions.preview)
              .then(() => callback())
              .catch(callback);
          } else {
            this.mailerLogger.warn(
              'previewEmail is not available. Skipping preview.',
            );
            return callback();
          }
        });
      }
    }

    // Register user-defined nodemailer plugins
    if (this.mailerOptions.plugins) {
      for (const plugin of this.mailerOptions.plugins) {
        transporter.use(plugin.step, plugin.plugin);
      }
    }

    // Last, so it sees the HTML templates and plugins produced
    if (this.mailerOptions.textFromHtml !== false) {
      transporter.use('compile', (mail, callback) => {
        const data = mail.data as ISendMailOptions;
        if (data.text === undefined && !data.raw) {
          const html = bodyToString(data.html);
          if (html) data.text = htmlToText(html);
        }
        callback();
      });
    }
  }

  private readonly mailerLogger = new Logger(MailerService.name);
  private readonly retry: ResolvedRetry;
  private readonly mailables = new Map<Type<unknown>, Mailable<any>>();
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    @Inject(MAILER_OPTIONS) private readonly mailerOptions: MailerOptions,
    @Optional()
    @Inject(MAILER_TRANSPORT_FACTORY)
    private readonly transportFactory: IMailerTransportFactory = new MailerTransportFactory(
      mailerOptions,
    ),
    @Optional()
    private readonly eventService?: MailerEventService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    this.validateTransportOptions();
    this.retry = resolveRetry(this.mailerOptions.retry);

    /** Adapter setup **/
    this.templateAdapter = this.mailerOptions.template?.adapter;

    /*
     * Preview setup
     * THIS NEED TO RUN BEFORE ANY CALL TO `initTemplateAdapter`
     */
    if (this.mailerOptions.preview) {
      this.mailerOptions.preview = withPreviewDefaults(
        this.mailerOptions.preview,
      );
    }

    /** Transporters setup **/
    this.setupTransporters();
    this.warnAboutLocalTransports();
  }

  /** A transport that never delivers (files, logs, memory) in production is almost always a mistake */
  private warnAboutLocalTransports(): void {
    if (process.env.NODE_ENV !== 'production') return;
    const configs: Array<[string, unknown]> = [
      ['transport', this.mailerOptions.transport],
      ...Object.entries(this.mailerOptions.transports ?? {}).map(
        ([name, config]): [string, unknown] => [`transports.${name}`, config],
      ),
    ];
    for (const [where, config] of configs) {
      if ((config as Record<symbol, unknown> | undefined)?.[LOCAL_TRANSPORT]) {
        this.mailerLogger.warn(
          `\`${where}\` is ${(config as object).constructor.name}, which doesn't deliver email, and NODE_ENV is "production".`,
        );
      }
    }
  }

  /**
   * Resolves once every send started so far has settled, or after
   * `timeoutMs`. Shutdown calls it before closing the transporters.
   */
  async drain(
    timeoutMs = this.mailerOptions.shutdownTimeout ?? 30_000,
  ): Promise<void> {
    if (this.inFlight.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.mailerLogger.warn(
          `Closing with ${this.inFlight.size} email(s) still sending after ${timeoutMs}ms`,
        );
        resolve();
      }, timeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.inFlight]), timeout]);
    clearTimeout(timer);
  }

  /** Feature 7: Auto-close transporter connections on module destroy */
  async onModuleDestroy(): Promise<void> {
    await this.drain();
    const closePromises: Promise<void>[] = [];

    if (this.transporter) {
      closePromises.push(this.closeTransporter(this.transporter));
    }

    for (const [, transporter] of this.transporters) {
      closePromises.push(this.closeTransporter(transporter));
    }

    await Promise.allSettled(closePromises);
  }

  private async closeTransporter(transporter: Transporter): Promise<void> {
    try {
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
    } catch (error) {
      this.mailerLogger.warn(
        `Error closing transporter: ${(error as Error).message}`,
      );
    }
  }

  private validateTransportOptions(): void {
    if (
      (!this.mailerOptions.transport ||
        Object.keys(this.mailerOptions.transport).length <= 0) &&
      !this.mailerOptions.transports
    ) {
      throw new Error(
        'Make sure to provide a nodemailer transport configuration object, connection url or a transport plugin instance.',
      );
    }
  }

  private createTransporter(config: TransportType, name?: string): Transporter {
    const transporter = this.transportFactory.createTransport(config);
    if (this.mailerOptions.verifyTransporters)
      this.verifyTransporter(transporter, name);
    this.initTemplateAdapter(this.templateAdapter, transporter);
    return transporter;
  }

  private setupTransporters(): void {
    if (this.mailerOptions.transports) {
      Object.keys(this.mailerOptions.transports).forEach((name) => {
        const transporter = this.createTransporter(
          this.mailerOptions.transports![name],
          name,
        );
        this.transporters.set(name, transporter);
      });
    }

    if (this.mailerOptions.transport) {
      this.transporter = this.createTransporter(this.mailerOptions.transport);
    }
  }

  private verifyTransporter(transporter: Transporter, name?: string): void {
    const transporterName = name ? ` '${name}'` : '';
    if (!transporter.verify) return;
    Promise.resolve(transporter.verify())
      .then(() =>
        this.mailerLogger.log(`Transporter${transporterName} is ready`),
      )
      .catch((error) =>
        this.mailerLogger.error(
          `Error occurred while verifying the transporter${transporterName}: ${error.message}`,
        ),
      );
  }

  public async verifyAllTransporters() {
    const transporters = [...this.transporters.values()];
    // Only named `transports` may be configured, leaving no default transporter
    if (this.transporter) transporters.push(this.transporter);
    const transportersVerified = await Promise.all(
      transporters.map((transporter) => {
        if (!transporter.verify) return true; // Can't verify with nodemailer-sendgrid, so assume it's verified
        return Promise.resolve(transporter.verify())
          .then(() => true)
          .catch(() => false);
      }),
    );
    return transportersVerified.every((verified) => verified);
  }

  /** Feature 1: Interpolate subject with template context */
  private interpolateSubject(
    subject: string,
    context: Record<string, any>,
  ): string {
    return interpolate(subject, context);
  }

  /**
   * Feature 3: Compile inline HTML string with template context.
   * `{{key}}` is HTML-escaped; use `{{{key}}}` to insert trusted markup.
   */
  private interpolateHtml(html: string, context: Record<string, any>): string {
    return interpolate(html, context, { escape: true });
  }

  /**
   * Applies everything that shapes the content: subject and inline HTML
   * interpolation, the text template, the locale and the template resolver.
   */
  private async prepareContent(
    sendMailOptions: ISendMailOptions,
  ): Promise<ISendMailOptions> {
    if (isHtmlObject(sendMailOptions.html)) {
      sendMailOptions = {
        ...sendMailOptions,
        html: sendMailOptions.html.toString(),
      };
    }

    // Feature 1: Subject template parsing
    if (sendMailOptions.subject && sendMailOptions.context) {
      sendMailOptions = {
        ...sendMailOptions,
        subject: this.interpolateSubject(
          sendMailOptions.subject,
          sendMailOptions.context,
        ),
      };
    }

    // Feature 3: HTML string interpolation (when no file-based template)
    if (
      sendMailOptions.html &&
      typeof sendMailOptions.html === 'string' &&
      sendMailOptions.context &&
      !sendMailOptions.template
    ) {
      sendMailOptions = {
        ...sendMailOptions,
        html: this.interpolateHtml(
          sendMailOptions.html as string,
          sendMailOptions.context,
        ),
      };
    }

    // Feature 4: Text/plain fallback template
    if (
      sendMailOptions.textTemplate &&
      sendMailOptions.context &&
      this.mailerOptions.template?.dir
    ) {
      sendMailOptions = {
        ...sendMailOptions,
        text: await this.compileTextTemplate(
          this.mailerOptions.template.dir,
          sendMailOptions.textTemplate,
          sendMailOptions.context,
        ),
      };
    }

    // i18n: resolve locale-specific template path
    if (
      sendMailOptions.template &&
      sendMailOptions.locale &&
      this.mailerOptions.i18n
    ) {
      sendMailOptions = {
        ...sendMailOptions,
        template: this.resolveI18nTemplate(
          sendMailOptions.template,
          sendMailOptions.locale,
        ),
      };
    }

    // Template resolver: load template from external source
    if (
      sendMailOptions.template &&
      this.mailerOptions.template?.resolver &&
      !sendMailOptions.html
    ) {
      const resolved = await this.mailerOptions.template.resolver.resolve(
        sendMailOptions.template,
        sendMailOptions.context,
      );
      sendMailOptions = {
        ...sendMailOptions,
        html: resolved.content as any,
        // Apply metadata (e.g., subject from template)
        ...(resolved.metadata?.subject && !sendMailOptions.subject
          ? { subject: resolved.metadata.subject }
          : {}),
      };
    }

    return sendMailOptions;
  }

  /** Applies the delivery rules: unsubscribe headers, idempotency, suppression, interception */
  private async prepareDelivery(
    sendMailOptions: ISendMailOptions,
  ): Promise<{ mail: ISendMailOptions; suppressed: string[] }> {
    if (this.mailerOptions.validate !== false && !sendMailOptions.raw) {
      validateMessage(sendMailOptions);
    }

    if (sendMailOptions.unsubscribe) {
      sendMailOptions = applyUnsubscribe(
        sendMailOptions,
        sendMailOptions.unsubscribe,
      );
    }

    if (sendMailOptions.idempotencyKey && !sendMailOptions.messageId) {
      sendMailOptions = {
        ...sendMailOptions,
        messageId: messageIdFor(
          sendMailOptions.idempotencyKey,
          sendMailOptions.from ??
            (this.mailerOptions.defaults as ISendMailOptions | undefined)?.from,
        ),
      };
    }

    let suppressed: string[] = [];
    if (this.mailerOptions.suppress) {
      ({ mail: sendMailOptions, suppressed } = await applySuppression(
        sendMailOptions,
        this.mailerOptions.suppress,
      ));
    }

    if (this.mailerOptions.intercept) {
      sendMailOptions = await applyIntercept(
        sendMailOptions,
        this.mailerOptions.intercept,
      );
    }

    return { mail: sendMailOptions, suppressed };
  }

  public sendMail(sendMailOptions: ISendMailOptions): Promise<SentMessageInfo> {
    // Tracked so shutdown can wait for it
    const sending = this.sendNow(sendMailOptions);
    this.inFlight.add(sending);
    const forget = () => this.inFlight.delete(sending);
    sending.then(forget, forget);
    return sending;
  }

  private async sendNow(
    sendMailOptions: ISendMailOptions,
  ): Promise<SentMessageInfo> {
    sendMailOptions = await this.prepareContent(sendMailOptions);
    const { mail, suppressed } = await this.prepareDelivery(sendMailOptions);
    sendMailOptions = mail;

    if (suppressed.length > 0) {
      this.eventService?.emit(MailerEvent.SUPPRESSED, {
        mailOptions: sendMailOptions,
        suppressed,
        timestamp: new Date(),
      });
      if (recipientsOf(sendMailOptions).length === 0) {
        const info: SuppressedMessageInfo = {
          messageId: undefined,
          accepted: [],
          rejected: [],
          suppressed,
          response: 'Not sent: every recipient is suppressed',
        };
        return info;
      }
    }

    // Emit before_send event
    this.eventService?.emit(MailerEvent.BEFORE_SEND, {
      mailOptions: sendMailOptions,
      timestamp: new Date(),
    });

    const startedAt = Date.now();
    const progress = {
      attempt: 0,
      transporterName: undefined as string | undefined,
    };

    try {
      const result = await this.deliver(sendMailOptions, progress);

      // Emit after_send event
      this.eventService?.emit(MailerEvent.AFTER_SEND, {
        mailOptions: sendMailOptions,
        result,
        timestamp: new Date(),
        attempt: progress.attempt,
        transporterName: progress.transporterName,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      // An abort rejects with the signal's own reason, as callers expect
      const aborted =
        sendMailOptions.signal?.aborted &&
        error === sendMailOptions.signal.reason;
      // Only what a transport threw is wrapped; configuration errors (an
      // unknown transporter) and aborts are thrown as they are
      const failure =
        this.mailerOptions.wrapErrors === false ||
        aborted ||
        progress.attempt === 0
          ? error
          : toMailerError(error);
      // Emit send_error event
      this.eventService?.emit(MailerEvent.SEND_ERROR, {
        mailOptions: sendMailOptions,
        error: failure as Error,
        timestamp: new Date(),
        attempt: progress.attempt,
        permanent: !isTransientError(failure),
        transporterName: progress.transporterName,
        durationMs: Date.now() - startedAt,
      });
      throw failure;
    }
  }

  /**
   * Sends an email rendered by a mail class, or written inline.
   *
   * @example
   * ```typescript
   * await mailerService.send(WelcomeMail, { to: user.email, data: user });
   * await mailerService.send({ to, subject: 'Hi', template: 'welcome', context });
   * ```
   */
  public send(mail: ISendMailOptions): Promise<SentMessageInfo>;
  public send<M extends Mailable<any>>(
    mail: Type<M> | M,
    // biome-ignore lint/suspicious/noConfusingVoidType: a class rendering `void` needs no options
    ...options: [MailableData<M>] extends [void]
      ? [options?: MailableSendOptions<MailableData<M>>]
      : unknown extends MailableData<M>
        ? [options?: MailableSendOptions<MailableData<M>>]
        : [options: MailableSendOptions<MailableData<M>>]
  ): Promise<SentMessageInfo>;
  public async send(
    mail: ISendMailOptions | Type<Mailable<any>> | Mailable<any>,
    options?: MailableSendOptions<any>,
  ): Promise<SentMessageInfo> {
    if (this.isMailable(mail)) {
      return this.sendMail(
        await this.composeMailable(mail, options ?? ({} as any)),
      );
    }
    return this.sendMail(mail as ISendMailOptions);
  }

  /**
   * Renders an email without sending it: for previews, snapshots and tests.
   * Recipients are optional.
   */
  public render(mail: ISendMailOptions): Promise<RenderedMail>;
  public render<M extends Mailable<any>>(
    mail: Type<M> | M,
    options?: Partial<MailableSendOptions<MailableData<M>>>,
  ): Promise<RenderedMail>;
  public async render(
    mail: ISendMailOptions | Type<Mailable<any>> | Mailable<any>,
    options?: Partial<MailableSendOptions<any>>,
  ): Promise<RenderedMail> {
    const composed = this.isMailable(mail)
      ? await this.composeMailable(
          mail,
          (options ?? {}) as MailableSendOptions<any>,
        )
      : (mail as ISendMailOptions);
    const data: Record<string, any> = {
      ...(await this.prepareContent(composed)),
    };

    if (
      this.templateAdapter &&
      !data.html &&
      (data.template || data.text === undefined)
    ) {
      await compileTemplate(this.templateAdapter, data, this.mailerOptions);
    }

    const defaults = (this.mailerOptions.defaults ?? {}) as ISendMailOptions;
    return {
      subject: data.subject ?? defaults.subject,
      html: bodyToString(data.html),
      text: bodyToString(data.text),
      from: data.from ?? defaults.from,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      replyTo: data.replyTo ?? defaults.replyTo,
      attachments: data.attachments ?? [],
      headers: data.headers,
      template: data.template,
      locale: data.locale,
    };
  }

  /** A mail class or instance; plain send options never have a `render()` */
  private isMailable(
    mail: unknown,
  ): mail is Type<Mailable<any>> | Mailable<any> {
    return (
      typeof mail === 'function' ||
      typeof (mail as Mailable<any>).render === 'function'
    );
  }

  /** Renders a mail class and merges the per-send options over its output */
  private async composeMailable(
    mail: Type<Mailable<any>> | Mailable<any>,
    options: MailableSendOptions<any>,
  ): Promise<ISendMailOptions> {
    const instance = await this.resolveMailable(mail);
    const { data, attachments, headers, ...delivery } = options;
    const content: MailableContent = await instance.render(data, {
      locale: delivery.locale,
      to: parseAddresses(delivery.to),
    });
    const overrides = Object.fromEntries(
      Object.entries(delivery).filter(([, value]) => value !== undefined),
    );
    return {
      ...content,
      ...overrides,
      attachments: [...(content.attachments ?? []), ...(attachments ?? [])],
      headers: mergeHeaders(content.headers, headers),
      mailable: (typeof mail === 'function'
        ? mail
        : mail.constructor) as Type<unknown>,
    };
  }

  /**
   * A mail class registered as a provider is used as is, so it can inject
   * that module's providers. Otherwise it is created once, with its
   * dependencies resolved from the application.
   */
  private async resolveMailable(
    mail: Type<Mailable<any>> | Mailable<any>,
  ): Promise<Mailable<any>> {
    if (typeof mail !== 'function') return mail;
    const cached = this.mailables.get(mail);
    if (cached) return cached;

    let instance: Mailable<any>;
    if (!this.moduleRef) {
      instance = new mail();
    } else {
      try {
        instance = this.moduleRef.get(mail, { strict: false });
      } catch {
        instance = this.instantiateMailable(mail);
      }
    }
    this.mailables.set(mail, instance);
    return instance;
  }

  /**
   * Creates a mail class that isn't a provider, resolving each constructor
   * dependency from anywhere in the application (not only from this module).
   */
  private instantiateMailable(mail: Type<Mailable<any>>): Mailable<any> {
    const types: unknown[] =
      Reflect.getMetadata('design:paramtypes', mail) ?? [];
    // Tokens given with @Inject() override the reflected types
    const injected: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata('self:paramtypes', mail) ?? [];
    const tokens = types.map(
      (type, index) => injected.find((i) => i.index === index)?.param ?? type,
    );
    const dependencies = tokens.map((token, index) => {
      try {
        return this.moduleRef!.get(token as any, { strict: false });
      } catch {
        const name = typeof token === 'function' ? token.name : String(token);
        throw new ReferenceError(
          `${mail.name} needs ${name} (constructor argument ${index}), which isn't available. ` +
            `Register ${mail.name} as a provider in the module that has ${name}.`,
        );
      }
    });
    return new mail(...dependencies);
  }

  /** The transporters to try for an email, in order: the selected one, then `failover` */
  private transporterChain(
    sendMailOptions: ISendMailOptions,
  ): Array<{ name?: string; transporter: Transporter }> {
    const primary = sendMailOptions.transporterName || undefined;
    const chain = [
      { name: primary, transporter: this.selectTransporter(primary) },
    ];
    const failover =
      sendMailOptions.failover === false
        ? []
        : (sendMailOptions.failover ?? this.mailerOptions.failover ?? []);
    for (const name of failover) {
      if (name === primary) continue;
      const transporter = this.transporters.get(name);
      if (!transporter) {
        throw new ReferenceError(
          `Failover transporter "${name}" is not configured in \`transports\``,
        );
      }
      chain.push({ name, transporter });
    }
    return chain;
  }

  private selectTransporter(name?: string): Transporter {
    if (name) {
      const transporter = this.transporters.get(name);
      if (transporter) return transporter;
      throw new ReferenceError(`Transporters object doesn't have ${name} key`);
    }
    if (this.transporter) return this.transporter;
    throw new ReferenceError('Transporter object undefined');
  }

  /** Sends through the transporter chain, retrying transient failures on each one */
  private async deliver(
    sendMailOptions: ISendMailOptions,
    progress: { attempt: number; transporterName?: string },
  ): Promise<SentMessageInfo> {
    const { retry, signal, failover: _, ...mail } = sendMailOptions;
    const policy = retry === undefined ? this.retry : resolveRetry(retry);
    // Feature 9: Send timeout
    const timeout = sendMailOptions.timeout ?? this.mailerOptions.sendTimeout;
    const chain = this.transporterChain(sendMailOptions);

    for (let index = 0; ; index++) {
      const { name, transporter } = chain[index];
      progress.transporterName = name;
      try {
        return await this.sendWithRetry(
          transporter,
          mail as Omit<ISendMailOptions, DeliveryControl>,
          { policy, signal, timeout, progress },
        );
      } catch (error) {
        const next = chain[index + 1];
        if (
          !next ||
          signal?.aborted ||
          !canFailover(error) ||
          this.wouldDuplicate(error, mail)
        ) {
          throw error;
        }
        this.mailerLogger.warn(
          `Transporter ${name ? `'${name}'` : '(default)'} failed (${(error as Error).message}), trying '${next.name}'`,
        );
        this.eventService?.emit(MailerEvent.FAILOVER, {
          mailOptions: sendMailOptions,
          error: error as Error,
          timestamp: new Date(),
          transporterName: next.name,
        });
      }
    }
  }

  private async sendWithRetry(
    transporter: Transporter,
    mail: Omit<ISendMailOptions, DeliveryControl>,
    {
      policy,
      signal,
      timeout,
      progress,
    }: {
      policy: ResolvedRetry;
      signal?: AbortSignal;
      timeout?: number;
      progress: { attempt: number; transporterName?: string };
    },
  ): Promise<SentMessageInfo> {
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) throw abortReason(signal);
      progress.attempt = attempt;
      try {
        let sendPromise: Promise<SentMessageInfo> = transporter.sendMail(
          mail as Parameters<Transporter['sendMail']>[0],
        );
        if (timeout && timeout > 0) {
          sendPromise = this.withTimeout(sendPromise, timeout);
        }
        return await raceSignal(sendPromise, signal);
      } catch (error) {
        if (
          attempt >= policy.attempts ||
          signal?.aborted ||
          !isTransientError(error) ||
          this.wouldDuplicate(error, mail) ||
          (policy.retryIf && !policy.retryIf(error, attempt))
        ) {
          throw error;
        }
        const delay = retryDelay(policy, attempt, error);
        this.eventService?.emit(MailerEvent.RETRY, {
          mailOptions: mail,
          error: error as Error,
          timestamp: new Date(),
          attempt,
          transporterName: progress.transporterName,
        });
        await sleep(delay, signal);
      }
    }
  }

  /**
   * Whether sending again could deliver a second copy: the message may already
   * be delivered and has no stable Message-ID (`idempotencyKey` or `messageId`)
   * that would let mailbox providers drop the duplicate.
   */
  private wouldDuplicate(error: unknown, mail: ISendMailOptions): boolean {
    return mayHaveBeenDelivered(error) && !mail.messageId;
  }

  /** Feature 9: Timeout wrapper (per attempt) */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new MailerTimeoutError(
          `Send mail timed out after ${ms}ms`,
          { timeoutMs: ms },
        );
        // The send keeps running and may still deliver the message
        Object.defineProperty(error, 'mailerTimeout', { value: true });
        reject(error);
      }, ms);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** Feature 4: Compile a plain text template file */
  private async compileTextTemplate(
    templateDir: string,
    templatePath: string,
    context: Record<string, any>,
  ): Promise<string> {
    const ext = path.extname(templatePath) || '.txt';
    const name = path.basename(templatePath, path.extname(templatePath));
    const fullPath = path.join(
      templateDir,
      path.dirname(templatePath),
      name + ext,
    );

    if (!isWithinDirectory(templateDir, fullPath)) {
      this.mailerLogger.warn(
        `Text template "${templatePath}" is outside the template directory, skipping text fallback.`,
      );
      return '';
    }

    try {
      // Simple interpolation for text templates
      return interpolate(fs.readFileSync(fullPath, 'utf-8'), context);
    } catch {
      this.mailerLogger.warn(
        `Text template "${fullPath}" not found, skipping text fallback.`,
      );
      return '';
    }
  }

  /**
   * Resolve a locale-specific template path.
   * Checks if the locale-specific template exists, falls back to default locale.
   */
  private resolveI18nTemplate(template: string, locale: string): string {
    const i18n = this.mailerOptions.i18n!;
    // The locale usually comes from user input; never let it shape a path
    if (!LOCALE_PATTERN.test(locale)) {
      this.mailerLogger.warn(
        `Ignoring invalid locale "${locale}", using "${i18n.defaultLocale}"`,
      );
      locale = i18n.defaultLocale;
    }
    const pattern = i18n.templateDirPattern || '{{locale}}/';
    const templateDir = this.mailerOptions.template?.dir ?? '';
    const localizedTemplate = path.join(
      pattern.replace('{{locale}}', locale),
      template,
    );

    // The locale's template, else its language's (`es-CO` → `es`)
    if (templateDir) {
      const language = locale.split(/[-_]/)[0];
      const candidates = [localizedTemplate];
      if (language !== locale) {
        candidates.push(
          path.join(pattern.replace('{{locale}}', language), template),
        );
      }
      // `templateDir` comes from `template.dir`, so `template` is set here
      const dirs = [templateDir, ...(this.mailerOptions.template!.dirs ?? [])];
      const found = candidates.find((candidate) =>
        templateExists(dirs, candidate),
      );
      if (found) return found;
    }

    // Fallback to default locale
    if (i18n.fallback !== false && locale !== i18n.defaultLocale) {
      this.mailerLogger.debug(
        `Template "${localizedTemplate}" not found for locale "${locale}", falling back to "${i18n.defaultLocale}"`,
      );
      const fallbackPrefix = pattern.replace('{{locale}}', i18n.defaultLocale);
      return path.join(fallbackPrefix, template);
    }

    return localizedTemplate;
  }

  /** Get the default transporter (for advanced use cases) */
  public getTransporter(name?: string): Transporter {
    if (name) {
      const transporter = this.transporters.get(name);
      if (!transporter) {
        throw new ReferenceError(
          `Transporters object doesn't have ${name} key`,
        );
      }
      return transporter;
    }
    return this.transporter;
  }

  addTransporter(transporterName: string, config: TransportType): string {
    const transporter = this.createTransporter(config, transporterName);
    this.transporters.set(transporterName, transporter);
    return transporterName;
  }

  /** Remove and close a named transporter */
  removeTransporter(transporterName: string): boolean {
    const transporter = this.transporters.get(transporterName);
    if (transporter) {
      this.closeTransporter(transporter);
      return this.transporters.delete(transporterName);
    }
    return false;
  }
}
