import { Options } from '@css-inline/css-inline';

export interface TemplateAdapterConfig {
  inlineCssOptions?: Options;
  inlineCssEnabled?: boolean;
  /** Base URL for resolving relative CSS file paths in <link> tags */
  cssBaseUrl?: string;
}
