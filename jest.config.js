require('ts-node/register');
require('./server/polyfills');

module.exports = {
  'moduleFileExtensions': [
    'ts',
    'js',
    'json'
  ],
  'transform': {
    '^.+\\.ts$': 'ts-jest'
  },
  'testRegex': '\/lib\/.*\\.spec\\.(ts|js)$',
  'globals': {
    'ts-jest': {
      'tsConfigFile': 'tsconfig.json'
    }
  }
};
