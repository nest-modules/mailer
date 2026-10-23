/**
 * Errors thrown by the mailer. Every one extends `MailerError`, whose
 * `permanent` flag says whether sending the same message again can succeed;
 * `@nestjs/mail` and the BullMQ processor read the same flag.
 *
 * A wrapped error keeps the original as `cause` and copies the fields callers
 * already relied on (nodemailer's `code`, `responseCode`, `response`,
 * `command`, `rejected`), so existing checks keep working.
 */
export class MailerError extends Error {
  /** Retrying the same message can't succeed */
  readonly permanent: boolean;
  /** A nodemailer or Node.js error code, such as `EAUTH` or `ETIMEDOUT` */
  readonly code?: string;

  constructor(
    message: string,
    init: { permanent: boolean; code?: string; cause?: unknown },
  ) {
    super(
      message,
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.name = new.target.name;
    this.permanent = init.permanent;
    if (init.code !== undefined) this.code = init.code;
  }
}

/** DNS, socket or TLS failure before the server answered. Transient, except TLS certificate problems. */
export class MailerConnectionError extends MailerError {
  constructor(
    message: string,
    init: { code?: string; cause?: unknown; permanent?: boolean } = {},
  ) {
    super(message, {
      permanent: init.permanent ?? false,
      code: init.code,
      cause: init.cause,
    });
  }
}

/** A send took longer than allowed. Always transient. */
export class MailerTimeoutError extends MailerError {
  readonly timeoutMs?: number;

  constructor(
    message: string,
    init: { timeoutMs?: number; cause?: unknown } = {},
  ) {
    super(message, { permanent: false, code: 'ETIMEDOUT', cause: init.cause });
    if (init.timeoutMs !== undefined) this.timeoutMs = init.timeoutMs;
  }
}

/** The SMTP server answered with an error reply: 5xx is permanent, 4xx transient. */
export class MailerSmtpError extends MailerError {
  /** The SMTP reply code, e.g. `550` */
  readonly responseCode: number;
  /** The enhanced status code (RFC 3463), e.g. `5.1.1`, when the server sent one */
  readonly enhancedCode?: string;
  /** The command that failed: `MAIL FROM`, `RCPT TO`, `DATA`, `AUTH`, … */
  readonly command?: string;
  /** The server's reply */
  readonly response?: string;

  constructor(
    message: string,
    init: {
      responseCode: number;
      response?: string;
      command?: string;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, {
      permanent: init.responseCode >= 500,
      code: init.code,
      cause: init.cause,
    });
    this.responseCode = init.responseCode;
    if (init.response !== undefined) {
      this.response = init.response;
      const enhanced = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(init.response);
      if (enhanced) this.enhancedCode = enhanced[1];
    }
    if (init.command !== undefined) this.command = init.command;
  }
}

/** The server refused every recipient, so nothing was sent */
export class MailerRecipientsRejectedError extends MailerSmtpError {
  /** The refused addresses */
  readonly rejected: string[];

  constructor(
    message: string,
    init: ConstructorParameters<typeof MailerSmtpError>[1] & {
      rejected: string[];
    },
  ) {
    super(message, init);
    this.rejected = init.rejected;
  }
}

/** A template is missing or doesn't compile. Always permanent. */
export class MailerTemplateError extends MailerError {
  readonly template?: string;

  constructor(
    message: string,
    init: { template?: string; cause?: unknown } = {},
  ) {
    super(message, { permanent: true, code: 'ETEMPLATE', cause: init.cause });
    if (init.template !== undefined) this.template = init.template;
  }
}

/** The message is invalid (a malformed address, a header with a line break). Always permanent. */
export class MailerMessageError extends MailerError {
  /** The option that is invalid, such as `to` or `headers` */
  readonly field: string;

  constructor(message: string, init: { field: string; cause?: unknown }) {
    super(message, { permanent: true, code: 'EMESSAGE', cause: init.cause });
    this.field = init.field;
  }
}

/**
 * An HTTP email API (Resend, Postmark, SendGrid, SES, Mailgun, Brevo) refused
 * the request. Permanent for 4xx other than 408, 409 and 429.
 */
export class MailerProviderError extends MailerError {
  /** `resend`, `postmark`, `sendgrid`, `ses`, `mailgun` or `brevo` */
  readonly provider: string;
  /** The HTTP status */
  readonly status: number;
  /** The provider's own error name or number */
  readonly providerCode?: string;
  /** How long the provider asked to wait (`Retry-After`), in milliseconds */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    init: {
      provider: string;
      status: number;
      providerCode?: string;
      retryAfterMs?: number;
      permanent?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, {
      permanent:
        init.permanent ??
        (init.status >= 400 &&
          init.status < 500 &&
          ![408, 409, 429].includes(init.status)),
      code: init.providerCode,
      cause: init.cause,
    });
    this.provider = init.provider;
    this.status = init.status;
    if (init.providerCode !== undefined) this.providerCode = init.providerCode;
    if (init.retryAfterMs !== undefined) this.retryAfterMs = init.retryAfterMs;
  }
}
