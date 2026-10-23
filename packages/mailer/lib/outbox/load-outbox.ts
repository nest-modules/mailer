import type * as OutboxPackage from '@nestjs/outbox';

/** The parts of `@nestjs/outbox` this integration uses at runtime */
export type OutboxModuleExports = Pick<
  typeof OutboxPackage,
  'Outbox' | 'OnOutboxMessage' | 'NonRetryableMessageError'
>;

/**
 * Loads `@nestjs/outbox` when it is needed, not when this subpath is imported:
 * it is an optional, ESM-only peer dependency, which CommonJS can `require()`
 * on Node.js >= 20.19 (and >= 22.12).
 */
export function loadOutbox(): OutboxModuleExports {
  try {
    return require('@nestjs/outbox');
  } catch (error) {
    throw new Error(
      'MailerOutboxModule needs the @nestjs/outbox package: install it with `pnpm add @nestjs/outbox` ' +
        '(it is ESM-only, so loading it from CommonJS needs Node.js >= 20.19)',
      { cause: error },
    );
  }
}
