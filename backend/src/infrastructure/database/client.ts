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

/** Pool único da aplicação — repositories nunca criam conexões próprias. */
export function createDatabase(url: string, poolMax = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: poolMax });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Unidade de trabalho. O service decide quando uma operação precisa ser atômica e abre a
 * transação por aqui; os repositories recebem o `tx` e executam as queries dentro dela.
 */
export interface TransactionRunner {
  run<T>(work: (tx: DbTransaction) => Promise<T>): Promise<T>;
  /** Savepoint dentro de uma transação aberta: uma falha desfaz só este trecho. */
  savepoint<T>(tx: DbTransaction, work: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export function createTransactionRunner(db: Database): TransactionRunner {
  return {
    run: (work) => db.transaction(work),
    savepoint: (tx, work) => tx.transaction(work),
  };
}
