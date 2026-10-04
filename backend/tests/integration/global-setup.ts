import pg from "pg";
import { runMigrations } from "../../src/db/migrate.js";

/**
 * Recria o banco de TESTE do zero e aplica as migrations oficiais (as mesmas do deploy).
 * Recusa qualquer URL cujo nome de banco não indique ambiente de teste.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/orcamento_test";
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(`Recusado: "${databaseName}" não parece um banco de teste.`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error("TEST_DATABASE_URL não pode ser igual a DATABASE_URL.");
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }
  await runMigrations(url);
}
