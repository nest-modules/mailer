import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('should keep paragraphs, line breaks, headings and lists', () => {
    expect(
      htmlToText(
        '<h1>Welcome</h1><p>Hello <b>Ada</b>,<br>thanks!</p><ul><li>One</li><li>Two</li></ul><hr><div>Bye</div>',
      ),
    ).toBe('Welcome\n\nHello Ada,\nthanks!\n\n- One\n- Two\n\n---\n\nBye');
  });

  it('should write links as text and URL', () => {
    expect(
      htmlToText(
        '<a href="https://x.com/verify?a=1&amp;b=2">Verify</a> ' +
          "<a href='https://x.com'>https://x.com</a> " +
          '<a href="https://x.com/empty"><img src="a.png"></a> ' +
          '<a href="mailto:help@x.com">Help</a> <a href="#top">Top</a>',
      ),
    ).toBe(
      'Verify (https://x.com/verify?a=1&b=2) https://x.com https://x.com/empty Help Top',
    );
  });

  it('should drop head, styles, scripts and comments, and keep image alt text', () => {
    expect(
      htmlToText(
        '<html><head><title>T</title><style>p{}</style></head><body><!-- hidden -->' +
          '<script>alert(1)</script><img alt="Logo" src="x"><p>Body</p></body></html>',
      ),
    ).toBe('Logo\n\nBody');
  });

  it('should separate table cells and decode entities', () => {
    expect(
      htmlToText(
        '<table><tr><td>A</td><td>B</td></tr><tr><th>C</th></tr></table>' +
          '<p>&lt;tag&gt; &quot;q&quot; &apos;s&apos; &copy; &#169; &#xA9; &nbsp;x &unknown; &#0;</p>',
      ),
    ).toBe('A B\n\nC\n\n<tag> "q" \'s\' © © © x &unknown; &#0;');
  });

  it('should collapse whitespace', () => {
    expect(htmlToText('  <p>  a \t b  </p>\n\n\n\n<p>c</p>  ')).toBe(
      'a b\n\nc',
    );
  });

  it('should drop unclosed comments and dropped elements to the end', () => {
    expect(htmlToText('<p>a</p><!-- open')).toBe('a');
    expect(htmlToText('<p>a</p><script>alert(1)')).toBe('a');
    expect(htmlToText('<p>a</p><style>p{}</style')).toBe('a');
  });

  it('should keep elements that only start like a dropped one', () => {
    expect(htmlToText('<header>Top</header><titles>x</titles>')).toBe(
      'Top\n\nx',
    );
    expect(htmlToText('1 < 2 and 1 &lt; 3')).toBe('1 < 2 and 1 < 3');
  });

  it('should not leave a tag behind nested tags', () => {
    expect(htmlToText('<<b>i>x</i>')).toBe('x');
  });

  it('should stay linear on hostile input', () => {
    const inputs = [
      '<!--'.repeat(50_000),
      '<script'.repeat(50_000),
      `<a href="x">${'<'.repeat(50_000)}`,
    ];
    for (const input of inputs) {
      const started = Date.now();
      htmlToText(input);
      expect(Date.now() - started).toBeLessThan(1000);
    }
  });
});
