/* eslint-disable import/no-extraneous-dependencies */
const { defineConfig } = require('tsup');

exports.default = defineConfig({
  entry: ['index.ts'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
