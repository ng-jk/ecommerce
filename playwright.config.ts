import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
});
