/**
 * Result of resolving a template.
 */
export interface ResolvedTemplate {
  /** The raw template string content */
  content: string;
  /** Optional metadata (e.g., subject, from address) */
  metadata?: Record<string, any>;
}

/**
 * Interface for custom template resolvers.
 * Implement this to load templates from databases, S3, APIs, etc.
 */
export interface TemplateResolver {
  /**
   * Resolve a template by name.
   * @param templateName - The template identifier
   * @param context - Optional context (e.g., locale, tenant)
   * @returns The resolved template content
   */
  resolve(
    templateName: string,
    context?: Record<string, any>,
  ): Promise<ResolvedTemplate>;
}
