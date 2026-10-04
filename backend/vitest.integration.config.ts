import { defineConfig } from "vitest/config";

// Testes de integração usam um PostgreSQL real e isolado (docker-compose.test.yml: `npm run db:test:up`).
// O globalSetup recria o schema do banco de TESTE e aplica as migrations oficiais;
// os arquivos rodam em série porque o modo de manutenção é um estado global.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/unit", "tests/e2e"],
    environment: "node",
    globals: true,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/orcamento_test",
    },
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
