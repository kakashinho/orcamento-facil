const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: [
      "node_modules",
      "dist",
      "tests/unit",
      "tests/e2e",
    ],
    environment: "node",
    globals: true,
    setupFiles: ["tests/integration/setup.ts"],
  },
});
