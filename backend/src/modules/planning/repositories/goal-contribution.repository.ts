import { and, asc, eq, inArray } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { goalContributions } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { ContributionRecord } from "../types/goal.types.js";

type ContributionRow = typeof goalContributions.$inferSelect;

/** Vínculos entre receitas e metas (R17). O valor destinado é cifrado (R81). */
export class GoalContributionRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: ContributionRow): ContributionRecord {
    return {
      id: row.id,
      goalId: row.goalId,
      userId: row.userId,
      transactionId: row.transactionId,
      amountCents: this.cipher.decryptAmount(row.amount, aad.goalContributionAmount(row.id)),
      createdAt: row.createdAt,
    };
  }

  async insert(record: ContributionRecord, tx: DbTransaction): Promise<void> {
    try {
      await tx.insert(goalContributions).values({
        id: record.id,
        goalId: record.goalId,
        userId: record.userId,
        transactionId: record.transactionId,
        amount: this.cipher.encryptAmount(record.amountCents, aad.goalContributionAmount(record.id)),
        createdAt: record.createdAt,
      });
    } catch (error) {
      if (isUniqueViolation(error, "goal_contributions_goal_tx_uq")) throw new DuplicateEntryError("transactionId");
      throw error;
    }
  }

  async listByGoals(goalIds: string[]): Promise<ContributionRecord[]> {
    if (goalIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(goalContributions)
      .where(inArray(goalContributions.goalId, goalIds))
      .orderBy(asc(goalContributions.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  async listByTransaction(userId: string, transactionId: string, tx?: DbTransaction): Promise<ContributionRecord[]> {
    const rows = await this.executor(tx)
      .select()
      .from(goalContributions)
      .where(and(eq(goalContributions.userId, userId), eq(goalContributions.transactionId, transactionId)))
      .orderBy(asc(goalContributions.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  /** Remove o vínculo da meta do usuário; devolve se havia algo a remover. */
  async delete(userId: string, goalId: string, contributionId: string): Promise<boolean> {
    const result = await this.db
      .delete(goalContributions)
      .where(
        and(eq(goalContributions.id, contributionId), eq(goalContributions.goalId, goalId), eq(goalContributions.userId, userId)),
      );
    return (result.rowCount ?? 0) > 0;
  }
}
