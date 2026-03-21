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
};
