const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    ignores: [
      "backend/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-native/**",
      "**/.expo/**",
      ".scaffold/**",
      "packages/api-client/schema.d.ts",
      "packages/api-client/generated/**",
      "test-results/**",
    ],
  },
]);
