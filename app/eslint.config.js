// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "coverage/*", "scripts/*"],
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["src/core/logging/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["jest.setup-env.js", "tests/**/*.js"],
    languageOptions: { globals: { jest: "readonly", require: "readonly", module: "writable", process: "readonly" } },
  },
]);
