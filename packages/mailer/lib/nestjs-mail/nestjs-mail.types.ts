/**
 * The parts of `@nestjs/mail`'s API this integration touches, declared
 * structurally. `@nestjs/mail` is ESM-only, and importing its types from a
 * CommonJS package breaks `node16`/`nodenext` projects; these interfaces match
 * its classes, so instances are accepted wherever it expects them.
 */

/** A message `@nestjs/mail` built and validated (its `MailMessage`) */
export interface MailMessageLike {
  /** `<id@domain>`, as in the `Message-ID` header */
  readonly messageId: string;
  /** The SMTP envelope: the sender and every recipient (to, cc and bcc) */
  readonly envelope: { from: string; to: string[] };
  /** The message in MIME form, without `Bcc` */
  toMime(): Buffer;
}

/** What `@nestjs/mail` passes a transport besides the message */
export interface MailTransportSendOptionsLike {
  signal: AbortSignal;
  idempotencyKey?: string;
  attempt: number;
}

/** What a transport reports to `@nestjs/mail` once the message was accepted */
export interface MailTransportResultLike {
  accepted?: string[];
  providerMessageId?: string;
  response?: string;
}

/** `@nestjs/mail`'s `MailTransport` contract */
export interface MailTransportLike {
  send(
    message: MailMessageLike,
    options: MailTransportSendOptionsLike,
  ): Promise<MailTransportResultLike>;
  close?(): void | Promise<void>;
}

/** What `@nestjs/mail` passes a template engine besides the name and context */
export interface MailTemplateRenderOptionsLike {
  readonly locale: string | undefined;
}

/** `@nestjs/mail`'s `MailTemplateOutput` */
export type MailTemplateOutputLike = string | { html: string; text?: string };

/** `@nestjs/mail`'s `MailTemplateEngine` contract */
export interface MailTemplateEngineLike {
  render(
    name: string,
    context: object,
    options: MailTemplateRenderOptionsLike,
  ): MailTemplateOutputLike | Promise<MailTemplateOutputLike>;
}
