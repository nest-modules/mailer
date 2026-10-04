import { inline } from '@css-inline/css-inline';
import { inlineCss } from './inline-css';

jest.mock('@css-inline/css-inline', () => ({
  inline: jest.fn((html: string) => `inlined:${html}`),
}));

describe('inlineCss', () => {
  const inlineMock = inline as jest.MockedFunction<typeof inline>;

  beforeEach(() => inlineMock.mockClear());

  it('should disable remote stylesheets by default', () => {
    expect(inlineCss('<p/>')).toBe('inlined:<p/>');
    expect(inlineMock).toHaveBeenCalledWith('<p/>', {
      loadRemoteStylesheets: false,
    });
  });

  it('should keep the default when merging user options', () => {
    inlineCss('<p/>', { keepStyleTags: true });
    expect(inlineMock).toHaveBeenCalledWith('<p/>', {
      loadRemoteStylesheets: false,
      keepStyleTags: true,
    });
  });

  it('should let callers opt back into remote stylesheets', () => {
    inlineCss('<p/>', { loadRemoteStylesheets: true });
    expect(inlineMock).toHaveBeenCalledWith('<p/>', {
      loadRemoteStylesheets: true,
    });
  });
});
