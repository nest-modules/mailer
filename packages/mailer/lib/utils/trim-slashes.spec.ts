import { trimSlashes } from './trim-slashes';

describe('trimSlashes', () => {
  it('should trim both ends by default', () => {
    expect(trimSlashes('//admin/emails/')).toBe('admin/emails');
    expect(trimSlashes('///')).toBe('');
    expect(trimSlashes('')).toBe('');
  });

  it('should trim one end when asked', () => {
    expect(trimSlashes('/a/', { start: false })).toBe('/a');
    expect(trimSlashes('/a/', { end: false })).toBe('a/');
  });

  it('should stay fast on long runs of slashes', () => {
    const input = `${'/'.repeat(100_000)}x${'/'.repeat(100_000)}`;
    const started = Date.now();
    expect(trimSlashes(input)).toBe('x');
    expect(Date.now() - started).toBeLessThan(100);
  });
});
