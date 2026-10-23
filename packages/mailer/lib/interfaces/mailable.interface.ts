import { ISendMailOptions } from './send-mail-options.interface';

/** What `Mailable#render()` gets besides the data */
export interface MailableContext {
  /** The `locale` passed to `send()` or `render()`, if any */
  readonly locale: string | undefined;
  /**
   * The parsed `to` recipients (empty for a preview without them), in the
   * same shape as `@nestjs/mail`'s `MailRenderContext`
   */
  readonly to: readonly { readonly name?: string; readonly address: string }[];
}

/**
 * The content a mail class renders: a subject and a body, written inline
 * (`html`/`text`) or rendered from a template by the configured adapter.
 * The shape is compatible with `@nestjs/mail`, so the same mail classes work
 * with both libraries.
 */
export type MailableContent = Pick<
  ISendMailOptions,
  | 'subject'
  | 'html'
  | 'text'
  | 'template'
  | 'context'
  | 'textTemplate'
  | 'attachments'
  | 'headers'
  | 'from'
  | 'replyTo'
  | 'transporterName'
  | 'icalEvent'
  | 'unsubscribe'
>;

/**
 * A mail class: an injectable provider that turns typed data into an email.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class WelcomeMail implements Mailable<User> {
 *   render(user: User) {
 *     return { subject: `Welcome ${user.name}`, template: 'welcome', context: { user } };
 *   }
 * }
 *
 * await mailerService.send(WelcomeMail, { to: user.email, data: user });
 * ```
 */
export interface Mailable<TData = void> {
  render(
    data: TData,
    context: MailableContext,
  ): MailableContent | Promise<MailableContent>;
}

/** The data type a mail class renders */
export type MailableData<M> = M extends Mailable<infer TData> ? TData : never;

// biome-ignore lint/suspicious/noConfusingVoidType: `Mailable<void>` renders without data
type DataOption<TData> = [TData] extends [void]
  ? { data?: undefined }
  : unknown extends TData
    ? { data?: TData }
    : undefined extends TData
      ? { data?: TData }
      : { data: TData };

/**
 * `mailerService.send(MailClass, { ... })`: delivery options plus the class's data.
 * `from`, `replyTo` and `transporterName` override what `render()` returned,
 * `attachments` are appended and `headers` merged over.
 */
export type MailableSendOptions<TData> = Omit<
  ISendMailOptions,
  'subject' | 'html' | 'text' | 'template' | 'context' | 'textTemplate'
> &
  DataOption<TData>;

/** The result of `mailerService.render()`: the email as it would be sent */
export interface RenderedMail {
  subject?: string;
  html?: string;
  text?: string;
  from?: ISendMailOptions['from'];
  to?: ISendMailOptions['to'];
  cc?: ISendMailOptions['cc'];
  bcc?: ISendMailOptions['bcc'];
  replyTo?: ISendMailOptions['replyTo'];
  attachments: NonNullable<ISendMailOptions['attachments']>;
  headers?: ISendMailOptions['headers'];
  template?: string;
  locale?: string;
}
