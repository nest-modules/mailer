import { inline } from '@css-inline/css-inline';
import { inlineCss } from './inline-css';

// Port 9 (discard) is closed on CI and dev machines, so a fetch fails fast.
const html =
  '<html><head><link rel="stylesheet" href="http://127.0.0.1:9/a.css"></head><body><p>x</p></body></html>';

describe('inlineCss (real css-inline)', () => {
  it('should not fetch remote stylesheets by default', () => {
    expect(inlineCss(html)).toContain('<p>x</p>');
  });

  it('would fetch them with the library default', () => {
    expect(() => inline(html)).toThrow();
  });
});
