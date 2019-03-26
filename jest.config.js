require('ts-node/register');

module.exports = {
  'moduleFileExtensions': [
    'js',
    'json',
    'ts',
  ],
  'rootDir': 'lib',
  'testRegex': '/lib/.*\\.spec\\.(ts|js)$',
  'globals': {
    'ts-jest': {
      'tsConfig': 'tsconfig.json'
    }
  },
  'preset': 'ts-jest',
};
