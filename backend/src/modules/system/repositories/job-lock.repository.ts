import { sql } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";

export type LockOutcome<T> = { locked: false } | { locked: true; result: T };

/**
 * Trava consultiva do PostgreSQL por nome de tarefa: só uma instância da API roda
 * cada tarefa agendada por vez. A trava pertence a uma transação aberta só para segurá-la e some
 * no fim dela, inclusive se a tarefa falhar. A tarefa em si usa outras conexões do pool.
 */
export class JobLockRepository extends Repository {
  async withLock<T>(name: string, work: () => Promise<T>): Promise<LockOutcome<T>> {
    return this.db.transaction(async (tx) => {
      const result = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${name})) as locked`);
      if (!result.rows[0]?.locked) return { locked: false } as const;
      return { locked: true, result: await work() } as const;
    });
  }
}
