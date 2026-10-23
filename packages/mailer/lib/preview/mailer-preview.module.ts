import * as fs from 'node:fs';
import {
  Controller,
  DynamicModule,
  Get,
  Header,
  Inject,
  Logger,
  Module,
  NotFoundException,
  Param,
  Query,
  Req,
  Type,
} from '@nestjs/common';
import { Mailable, RenderedMail } from '../interfaces/mailable.interface';
import { ISendMailOptions } from '../interfaces/send-mail-options.interface';
import { MailerService } from '../mailer.service';
import { escapeHtml } from '../utils/interpolate';
import { trimSlashes } from '../utils/trim-slashes';

export const MAILER_PREVIEW_OPTIONS = 'MAILER_PREVIEW_OPTIONS';

/** One email the preview UI can render */
export type MailerPreview =
  | {
      name: string;
      description?: string;
      /** The email, or a function building it (sample data, fixtures) */
      mail:
        | ISendMailOptions
        | (() => ISendMailOptions | Promise<ISendMailOptions>);
    }
  | {
      name: string;
      description?: string;
      /** A mail class, rendered with `data` */
      mailable: Type<Mailable<any>>;
      data?: unknown | (() => unknown | Promise<unknown>);
      locale?: string;
    };

export interface MailerPreviewOptions {
  /** The emails to list */
  previews: MailerPreview[];
  /** Route prefix (default: `_mailer`) */
  path?: string;
  /**
   * Default: `true` only when `NODE_ENV` is `development` or `test`. The
   * routes have no authentication, so anywhere else turn them on explicitly.
   */
  enabled?: boolean;
}

type Attachment = NonNullable<ISendMailOptions['attachments']>[number];

/** Inline images use `cid:` URLs, which browsers can't load: embed them as data URLs */
function embedInlineImages(html: string, attachments: Attachment[]): string {
  return attachments.reduce((result, attachment) => {
    if (!attachment.cid) return result;
    let content: Buffer | undefined;
    if (Buffer.isBuffer(attachment.content)) content = attachment.content;
    else if (typeof attachment.content === 'string') {
      content = Buffer.from(
        attachment.content,
        (attachment.encoding as BufferEncoding | undefined) ?? 'utf-8',
      );
    } else if (
      typeof attachment.path === 'string' &&
      fs.existsSync(attachment.path)
    ) {
      content = fs.readFileSync(attachment.path);
    }
    if (!content) return result;
    const type = attachment.contentType ?? 'application/octet-stream';
    const url = `data:${type};base64,${content.toString('base64')}`;
    return result.split(`cid:${attachment.cid}`).join(url);
  }, html);
}

function createPreviewController(path: string): Type<unknown> {
  @Controller(path)
  class MailerPreviewController {
    constructor(
      private readonly mailer: MailerService,
      @Inject(MAILER_PREVIEW_OPTIONS)
      private readonly options: MailerPreviewOptions,
    ) {}

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    index(@Req() request: { originalUrl?: string; url?: string }): string {
      // From the request, so links work behind a global prefix or a proxy path
      const base = escapeHtml(
        trimSlashes(
          (request.originalUrl ?? request.url ?? `/${path}`).split('?')[0],
          { start: false },
        ),
      );
      const items = this.options.previews
        .map(
          (preview) =>
            `<li><a href="${base}/${encodeURIComponent(preview.name)}">${escapeHtml(preview.name)}</a>` +
            ` · <a href="${base}/${encodeURIComponent(preview.name)}/text">text</a>` +
            (preview.description
              ? `<p>${escapeHtml(preview.description)}</p>`
              : '') +
            '</li>',
        )
        .join('');
      return (
        '<!doctype html><html><head><meta charset="utf-8"><title>Email previews</title>' +
        '<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem}' +
        'li{margin:.75rem 0}p{margin:.25rem 0;color:#666}a{color:#e0234e}</style></head>' +
        `<body><h1>Email previews</h1><ul>${items || '<li>No previews registered</li>'}</ul></body></html>`
      );
    }

    @Get(':name')
    @Header('Content-Type', 'text/html; charset=utf-8')
    async html(
      @Param('name') name: string,
      @Query('locale') locale?: string,
    ): Promise<string> {
      const rendered = await this.render(name, locale);
      const html =
        rendered.html ??
        `<pre>${escapeHtml(rendered.text ?? '(this email has no body)')}</pre>`;
      return embedInlineImages(html, rendered.attachments);
    }

    @Get(':name/text')
    @Header('Content-Type', 'text/plain; charset=utf-8')
    async text(
      @Param('name') name: string,
      @Query('locale') locale?: string,
    ): Promise<string> {
      const rendered = await this.render(name, locale);
      return rendered.text ?? '';
    }

    private async render(name: string, locale?: string): Promise<RenderedMail> {
      const preview = this.options.previews.find((p) => p.name === name);
      if (!preview) throw new NotFoundException(`No email preview "${name}"`);
      if ('mailable' in preview) {
        const data =
          typeof preview.data === 'function'
            ? await preview.data()
            : preview.data;
        return this.mailer.render(preview.mailable, {
          data,
          locale: locale ?? preview.locale,
        });
      }
      const mail =
        typeof preview.mail === 'function'
          ? await preview.mail()
          : preview.mail;
      return this.mailer.render(locale ? { ...mail, locale } : mail);
    }
  }
  return MailerPreviewController;
}

/**
 * Serves rendered emails in the browser during development, at `/_mailer` by
 * default. On by default only when `NODE_ENV` is `development` or `test`.
 *
 * @example
 * ```typescript
 * MailerPreviewModule.register({
 *   previews: [
 *     { name: 'welcome', mailable: WelcomeMail, data: { name: 'Ada' } },
 *     { name: 'reset', mail: { subject: 'Reset', template: 'reset', context: { url: '#' } } },
 *   ],
 * })
 * ```
 */
@Module({})
export class MailerPreviewModule {
  static register(options: MailerPreviewOptions): DynamicModule {
    const enabled =
      options.enabled ??
      ['development', 'test'].includes(process.env.NODE_ENV ?? '');
    if (!enabled) {
      if (options.enabled === undefined) {
        new Logger(MailerPreviewModule.name).log(
          `Email previews are off (NODE_ENV is "${process.env.NODE_ENV ?? ''}"). ` +
            'Set NODE_ENV=development or `enabled: true` to serve them.',
        );
      }
      return { module: MailerPreviewModule };
    }

    const path = trimSlashes(options.path ?? '_mailer');
    new Logger(MailerPreviewModule.name).log(
      `Email previews served at /${path}`,
    );
    return {
      module: MailerPreviewModule,
      controllers: [createPreviewController(path)],
      providers: [{ provide: MAILER_PREVIEW_OPTIONS, useValue: options }],
    };
  }
}
