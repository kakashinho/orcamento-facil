/**
 * Testes de contrato: rodam a camada de dados do app (src/data/api + src/core/http) contra o
 * backend real. Exigem a API no ar — veja tests/contract/README.md.
 */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/contract/**/*.test.ts"],
  transform: { "^.+\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }] },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^expo-secure-store$": "<rootDir>/tests/contract/stubs/secure-store.js",
  },
  testTimeout: 30000,
};
