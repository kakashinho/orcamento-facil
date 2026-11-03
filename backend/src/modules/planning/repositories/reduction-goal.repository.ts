import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { reductionGoals } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { ReductionGoalRecord } from "../types/reduction-goal.types.js";

type ReductionGoalRow = typeof reductionGoals.$inferSelect;

/** Metas de redução (R67). A base é cifrada (R81). */
export class ReductionGoalRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: ReductionGoalRow): ReductionGoalRecord {
    return {
      id: row.id,
      userId: row.userId,
      categoryId: row.categoryId,
      percent: row.percent,
      baselineCents: this.cipher.decryptAmount(row.baselineAmount, aad.reductionGoalBaseline(row.id)),
      currency: row.currency,
      baselineMonths: row.baselineMonths,
      startMonth: row.startMonth,
      endMonth: row.endMonth,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(record: ReductionGoalRecord, tx: DbTransaction): Promise<void> {
    try {
      await tx.insert(reductionGoals).values({
        id: record.id,
        userId: record.userId,
        categoryId: record.categoryId,
        percent: record.percent,
        baselineAmount: this.cipher.encryptAmount(record.baselineCents, aad.reductionGoalBaseline(record.id)),
        currency: record.currency,
        baselineMonths: record.baselineMonths,
        startMonth: record.startMonth,
        endMonth: record.endMonth,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      if (isUniqueViolation(error, "reduction_goals_active_uq")) throw new DuplicateEntryError("categoryId");
      throw error;
    }
  }

  async findOwned(userId: string, goalId: string, tx?: DbTransaction): Promise<ReductionGoalRecord | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(reductionGoals)
      .where(and(eq(reductionGoals.id, goalId), eq(reductionGoals.userId, userId)))
      .for("update");
    return row ? this.toRecord(row) : undefined;
  }

  async findActive(userId: string, categoryId: string, tx?: DbTransaction): Promise<ReductionGoalRecord | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(reductionGoals)
      .where(and(eq(reductionGoals.userId, userId), eq(reductionGoals.categoryId, categoryId), isNull(reductionGoals.endMonth)));
    return row ? this.toRecord(row) : undefined;
  }

  /** Metas que valem no mês "AAAA-MM". */
  async listInForce(userId: string, month: string): Promise<ReductionGoalRecord[]> {
    const rows = await this.db
      .select()
      .from(reductionGoals)
      .where(
        and(
          eq(reductionGoals.userId, userId),
          lte(reductionGoals.startMonth, month),
          or(isNull(reductionGoals.endMonth), gte(reductionGoals.endMonth, month)),
        ),
      )
      .orderBy(asc(reductionGoals.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  async hasAny(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: reductionGoals.id })
      .from(reductionGoals)
      .where(eq(reductionGoals.userId, userId))
      .limit(1);
    return row !== undefined;
  }

  async close(goalId: string, endMonth: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(reductionGoals).set({ endMonth, updatedAt: now }).where(eq(reductionGoals.id, goalId));
  }

  async delete(goalId: string, tx: DbTransaction): Promise<void> {
    await tx.delete(reductionGoals).where(eq(reductionGoals.id, goalId));
  }
}
