import { beforeAll } from "vitest";

beforeAll(() => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL environment variable is required to run integration tests. " +
      "Set it to a test database URL (e.g., postgresql://postgres:postgres@localhost:5433/orcamento_test)"
    );
  }

  const devDatabaseUrl = process.env.DATABASE_URL;
  if (devDatabaseUrl && testDatabaseUrl === devDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL must not be the same as DATABASE_URL. " +
      "Test database must be isolated to prevent data loss. " +
      "Use a test database (e.g., orcamento_test) on a different port."
    );
  }

  if (!testDatabaseUrl.includes("orcamento_test") && !testDatabaseUrl.includes("test")) {
    throw new Error(
      "TEST_DATABASE_URL database name does not appear to be a test database. " +
      "Integration tests require an isolated test database to prevent accidental data loss. " +
      "Use a database name containing 'test' (e.g., orcamento_test)."
    );
  }
});
