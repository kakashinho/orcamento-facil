import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.js";

// Pasta oficial de migrations (versionada). Resolve igual a partir de src/infrastructure/database e dist/infrastructure/database.
export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../../drizzle");

export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, pool } = createDatabase(databaseUrl, 1);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log("Migrations aplicadas com sucesso.");
    })
    .catch((error: unknown) => {
      console.error("Falha ao aplicar migrations:", error);
      process.exit(1);
    });
}
