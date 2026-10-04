import type { Database, DbTransaction, Executor } from "./client.js";

/**
 * Base dos repositories: única camada que executa queries Drizzle.
 * Todo método aceita um `tx` opcional para participar da transação aberta pelo service.
 */
export abstract class Repository {
  constructor(protected readonly db: Database) {}

  protected executor(tx?: DbTransaction): Executor {
    return tx ?? this.db;
  }
}
