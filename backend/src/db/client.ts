import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Executor de consultas: o banco ou uma transação aberta. */
export type Executor = Database | DbTransaction;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDatabase(url: string, poolMax = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: poolMax });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
