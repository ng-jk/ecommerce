const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expoConfig,
  { ignores: ['backend/**', '**/node_modules/**', '**/dist/**', '**/dist-native/**', '**/.expo/**', '.scaffold/**', 'packages/api-client/schema.d.ts', 'test-results/**'] },
]);
