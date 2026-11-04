/** Testes unitários e de componentes (jest-expo, ambiente Android). */
module.exports = {
  preset: "jest-expo/android",
  setupFiles: ["<rootDir>/jest.setup-env.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.tsx"],
  testMatch: ["<rootDir>/src/**/*.test.ts?(x)", "<rootDir>/tests/unit/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}", "!src/app/**", "!src/test-utils/**"],
  clearMocks: true,
  // Telas com folhas animadas ficam lentas com a suíte inteira em paralelo; 5 s (padrão) dava falso negativo.
  testTimeout: 15000,
};
