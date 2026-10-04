import { escapeHtml, interpolate } from './interpolate';

describe('escapeHtml', () => {
  it('should escape the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('should leave safe text untouched', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});

describe('interpolate', () => {
  it('should replace known keys, trimming whitespace and stringifying values', () => {
    expect(
      interpolate('{{ a }}-{{b}}-{{c}}', { a: 1, b: false, c: null }),
    ).toBe('1-false-null');
  });

  it('should keep unknown and undefined keys as normalized placeholders', () => {
    expect(
      interpolate('{{ missing }} {{{ raw }}} {{undef}}', { undef: undefined }),
    ).toBe('{{missing}} {{{raw}}} {{undef}}');
  });

  it('should ignore inherited properties', () => {
    const context = Object.create({ inherited: 'nope' });
    expect(
      interpolate('{{inherited}}{{constructor}}{{__proto__}}', context),
    ).toBe('{{inherited}}{{constructor}}{{__proto__}}');
  });

  it('should work with null-prototype contexts', () => {
    const context = Object.assign(Object.create(null), { name: 'Ana' });
    expect(interpolate('{{name}}', context)).toBe('Ana');
  });

  it('should insert values raw when escaping is off', () => {
    expect(interpolate('{{v}}|{{{v}}}', { v: '<b>' })).toBe('<b>|<b>');
  });

  it('should escape double-brace values and keep triple-brace values raw when escaping is on', () => {
    expect(interpolate('{{v}}|{{{v}}}', { v: '<b>' }, { escape: true })).toBe(
      '&lt;b&gt;|<b>',
    );
  });

  it('should run in linear time on unterminated placeholders', () => {
    const input = `${'{{'.repeat(50_000)}x`;
    const start = Date.now();
    expect(interpolate(input, { x: 1 })).toBe(input);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
