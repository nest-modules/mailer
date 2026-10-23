// `@nestjs/outbox` is ESM-only and Jest cannot load it: every test mocks it
describe('loadOutbox', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@nestjs/outbox');
  });

  it('returns the @nestjs/outbox exports', () => {
    const exports = { Outbox: class {} };
    jest.doMock('@nestjs/outbox', () => exports, { virtual: true });
    jest.isolateModules(() => {
      const { loadOutbox } = require('./load-outbox');
      expect(loadOutbox()).toBe(exports);
    });
  });

  it('explains how to install @nestjs/outbox when it cannot be loaded', () => {
    const missing = new Error("Cannot find module '@nestjs/outbox'");
    jest.doMock(
      '@nestjs/outbox',
      () => {
        throw missing;
      },
      { virtual: true },
    );
    jest.isolateModules(() => {
      const { loadOutbox } = require('./load-outbox');
      let error: any;
      try {
        loadOutbox();
      } catch (e) {
        error = e;
      }
      expect(error.message).toMatch(/pnpm add @nestjs\/outbox/);
      expect(error.message).toMatch(/Node\.js >= 20\.19/);
      expect(error.cause).toBe(missing);
    });
  });
});
