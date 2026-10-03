// playwright.config.ts

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",

  use: {
    baseURL: "http://localhost",
  },

  reporter: "list",
});
