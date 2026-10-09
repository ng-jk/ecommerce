import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: [
        "packages/**/*.ts",
        "packages/**/*.tsx",
        "packages/**/*.js",
        "frontend/*/src/**/*.ts",
        "frontend/*/src/**/*.tsx",
      ],
      exclude: ["**/*.d.ts", "packages/api-client/generated/**"],
    },
  },
});
