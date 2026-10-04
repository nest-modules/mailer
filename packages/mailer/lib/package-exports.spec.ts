import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';

const packageJsonPath = path.join(__dirname, '..', 'package.json');

/**
 * Builds a fake installation of the package (real package.json, stub dist
 * files) so module resolution can be checked without building the package.
 */
function createFakeInstall(root: string): void {
  const pkgDir = path.join(root, 'node_modules', '@nestjs-modules', 'mailer');
  for (const file of ['index', 'adapters/handlebars.adapter']) {
    const base = path.join(pkgDir, 'dist', file);
    fs.mkdirSync(path.dirname(base), { recursive: true });
    fs.writeFileSync(`${base}.js`, `module.exports = ${JSON.stringify(file)};`);
    fs.writeFileSync(`${base}.d.ts`, 'export declare const value: string;\n');
  }
  fs.copyFileSync(packageJsonPath, path.join(pkgDir, 'package.json'));
}

function nodeResolve(root: string, specifier: string): string {
  return execFileSync(
    process.execPath,
    [
      '-e',
      `process.stdout.write(require.resolve(${JSON.stringify(specifier)}))`,
    ],
    { cwd: root, encoding: 'utf-8' },
  );
}

function tsResolve(
  root: string,
  specifier: string,
  options: ts.CompilerOptions,
): string | undefined {
  return ts.resolveModuleName(
    specifier,
    path.join(root, 'consumer.ts'),
    options,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
}

const resolutionModes: Array<[string, ts.CompilerOptions]> = [
  [
    'node10',
    {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
  ],
  [
    'node16',
    {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
  ],
  [
    'bundler',
    {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  ],
];

describe('package exports', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mailer-exports-'));
    createFakeInstall(root);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Import paths used by 2.0.x (dist/...) must keep working alongside the
  // newer subpaths, see https://github.com/nest-modules/mailer/issues/1319
  const cases: Array<[string, string]> = [
    ['@nestjs-modules/mailer', 'dist/index'],
    [
      '@nestjs-modules/mailer/adapters/handlebars.adapter',
      'dist/adapters/handlebars.adapter',
    ],
    [
      '@nestjs-modules/mailer/adapters/handlebars.adapter.js',
      'dist/adapters/handlebars.adapter',
    ],
    [
      '@nestjs-modules/mailer/dist/adapters/handlebars.adapter',
      'dist/adapters/handlebars.adapter',
    ],
    [
      '@nestjs-modules/mailer/dist/adapters/handlebars.adapter.js',
      'dist/adapters/handlebars.adapter',
    ],
    ['@nestjs-modules/mailer/dist/index', 'dist/index'],
  ];

  it.each(cases)('should resolve %s at runtime', (specifier, target) => {
    expect(nodeResolve(root, specifier)).toBe(
      path.join(
        fs.realpathSync(root),
        'node_modules/@nestjs-modules/mailer',
        `${target}.js`,
      ),
    );
  });

  describe.each(resolutionModes)('with %s type resolution', (_, options) => {
    it.each(cases)('should resolve types for %s', (specifier, target) => {
      expect(tsResolve(root, specifier, options)).toBe(
        path.join(
          root,
          'node_modules/@nestjs-modules/mailer',
          `${target}.d.ts`,
        ),
      );
    });
  });

  it('should expose package.json', () => {
    expect(nodeResolve(root, '@nestjs-modules/mailer/package.json')).toMatch(
      /mailer[\\/]package\.json$/,
    );
  });
});
