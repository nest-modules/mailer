import { inline, Options } from '@css-inline/css-inline';

/**
 * Inline CSS into `html`. Remote stylesheets are not fetched unless the caller
 * explicitly sets `loadRemoteStylesheets: true`, so rendering an email never
 * makes outbound requests to URLs that may come from template data.
 */
export function inlineCss(html: string, options?: Options): string {
  return inline(html, { loadRemoteStylesheets: false, ...options });
}
