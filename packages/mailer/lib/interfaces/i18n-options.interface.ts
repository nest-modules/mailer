/**
 * Configuration options for internationalized email templates.
 */
export interface I18nOptions {
  /** Default locale to use when none is specified (e.g., 'en') */
  defaultLocale: string;

  /**
   * Pattern for resolving locale-specific template directories.
   * Use `{{locale}}` as placeholder.
   * @example '{{locale}}/' resolves to 'es/welcome' for locale 'es'
   * @default '{{locale}}/'
   */
  templateDirPattern?: string;

  /**
   * Whether to fall back to defaultLocale if a locale-specific template is not found.
   * @default true
   */
  fallback?: boolean;
}
