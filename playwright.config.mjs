import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { browserName: "chromium", viewport: { width: 1000, height: 720 } },
});
