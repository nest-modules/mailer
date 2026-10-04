require('ts-node/register');

module.exports = {
  'moduleFileExtensions': [
    'js',
    'json',
    'ts',
  ],
  'rootDir': 'lib',
  'testRegex': '/lib/.*\\.spec\\.(ts|js)$',
  'transform': {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  'collectCoverageFrom': [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.d.ts',
    // Type-only declarations: nothing to execute
    '!interfaces/**',
  ],
  'coverageDirectory': '../coverage',
  'coverageThreshold': {
    'global': {
      'branches': 100,
      'functions': 100,
      'lines': 100,
      'statements': 100,
    },
  },
};
