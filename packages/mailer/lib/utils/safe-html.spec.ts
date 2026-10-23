import { html, isSafeHtml, SafeHtml, unsafeHtml } from './safe-html';

describe('html tag', () => {
  it('should escape interpolated values', () => {
    const name = '<img src=x onerror="alert(1)">';
    expect(String(html`<p>Hi ${name}</p>`)).toBe(
      '<p>Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>',
    );
  });

  it('should join arrays, keep nested and trusted HTML, and skip empty values', () => {
    const items = ['a', '<b>'];
    const result = html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>${unsafeHtml(
      '<hr>',
    )}${null}${undefined}${false}${0}`;
    expect(result.toString()).toBe(
      '<ul><li>a</li><li>&lt;b&gt;</li></ul><hr>0',
    );
  });

  it('should be recognized and serialized as a string', () => {
    const value = html`<p>x</p>`;
    expect(value).toBeInstanceOf(SafeHtml);
    expect(isSafeHtml(value)).toBe(true);
    expect(isSafeHtml('<p>x</p>')).toBe(false);
    expect(isSafeHtml(null)).toBe(false);
    expect(JSON.stringify({ value })).toBe('{"value":"<p>x</p>"}');
  });
});
