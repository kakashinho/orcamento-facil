const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: [
      "node_modules",
      "dist",
      "tests/e2e",
      "tests/integration",
    ],
    environment: "node",
    globals: true,
  },
});
