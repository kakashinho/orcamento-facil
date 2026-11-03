import { and, asc, eq, inArray } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { savingsGoals } from "../../../infrastructure/database/schema.js";
import type { GoalChanges, GoalRecord, GoalStatus } from "../types/goal.types.js";

type GoalRow = typeof savingsGoals.$inferSelect;

/** Metas de economia (R15). O valor alvo é cifrado (R81). */
export class GoalRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: GoalRow): GoalRecord {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      categoryId: row.categoryId,
      targetCents: this.cipher.decryptAmount(row.targetAmount, aad.savingsGoalTarget(row.id)),
      currency: row.currency,
      deadline: row.deadline,
      status: row.status as GoalStatus,
      achievedAt: row.achievedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(record: GoalRecord): Promise<void> {
    await this.db.insert(savingsGoals).values({
      id: record.id,
      userId: record.userId,
      name: record.name,
      categoryId: record.categoryId,
      targetAmount: this.cipher.encryptAmount(record.targetCents, aad.savingsGoalTarget(record.id)),
      currency: record.currency,
      deadline: record.deadline,
      status: record.status,
      achievedAt: record.achievedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findOwned(userId: string, goalId: string, tx?: DbTransaction, forUpdate = false): Promise<GoalRecord | undefined> {
    const query = this.executor(tx)
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId)));
    const [row] = forUpdate ? await query.for("update") : await query;
    return row ? this.toRecord(row) : undefined;
  }

  async list(userId: string, statuses: GoalStatus[]): Promise<GoalRecord[]> {
    const rows = await this.db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.userId, userId), inArray(savingsGoals.status, statuses)))
      .orderBy(asc(savingsGoals.deadline), asc(savingsGoals.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  /** Metas ativas de todos os usuários cuja data limite está entre as datas pedidas (lembretes — R18). */
  async listActiveByDeadlines(deadlines: string[]): Promise<GoalRecord[]> {
    if (deadlines.length === 0) return [];
    const rows = await this.db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.status, "active"), inArray(savingsGoals.deadline, deadlines)));
    return rows.map((row) => this.toRecord(row));
  }

  async update(goalId: string, changes: GoalChanges, tx?: DbTransaction): Promise<void> {
    const { targetCents, ...rest } = changes;
    await this.executor(tx)
      .update(savingsGoals)
      .set({
        ...rest,
        ...(targetCents === undefined ? {} : { targetAmount: this.cipher.encryptAmount(targetCents, aad.savingsGoalTarget(goalId)) }),
      })
      .where(eq(savingsGoals.id, goalId));
  }

  async setStatus(goalId: string, status: GoalStatus, achievedAt: Date | null, now: Date, tx?: DbTransaction): Promise<void> {
    await this.executor(tx).update(savingsGoals).set({ status, achievedAt, updatedAt: now }).where(eq(savingsGoals.id, goalId));
  }
}
