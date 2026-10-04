import * as path from 'node:path';

/** Whether `target` resolves to a path inside `directory` (or is the directory itself) */
export function isWithinDirectory(directory: string, target: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
