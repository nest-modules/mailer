import * as path from 'node:path';
import { isWithinDirectory } from './is-within-directory';

describe('isWithinDirectory', () => {
  const root = path.resolve('/srv/templates');

  it.each([
    ['the directory itself', root],
    ['a direct child', path.join(root, 'style.css')],
    ['a nested child', path.join(root, 'css', 'main.css')],
    ['a child whose name starts with dots', path.join(root, '..hidden.css')],
  ])('should accept %s', (_, target) => {
    expect(isWithinDirectory(root, target)).toBe(true);
  });

  it.each([
    ['the parent directory', path.dirname(root)],
    ['a sibling via ..', path.join(root, '..', 'other', 'file.css')],
    ['a sibling sharing the prefix', `${root}-backup${path.sep}style.css`],
    ['an unrelated absolute path', path.resolve('/etc/passwd')],
  ])('should reject %s', (_, target) => {
    expect(isWithinDirectory(root, target)).toBe(false);
  });

  it('should resolve relative paths before comparing', () => {
    expect(isWithinDirectory('templates', 'templates/a.css')).toBe(true);
    expect(isWithinDirectory('templates', 'templates/../a.css')).toBe(false);
  });
});
