import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { budgets } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { BudgetPeriod, BudgetRecord } from "../types/budget.types.js";

type BudgetRow = typeof budgets.$inferSelect;

/** Persistência dos orçamentos. O limite é cifrado (R81); o service só vê centavos em claro. */
export class BudgetRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: BudgetRow): BudgetRecord {
    return {
      id: row.id,
      userId: row.userId,
      categoryId: row.categoryId,
      period: row.period as BudgetPeriod,
      amountCents: this.cipher.decryptAmount(row.amount, aad.budgetAmount(row.id)),
      currency: row.currency,
      validFrom: row.validFrom,
      validTo: row.validTo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(record: BudgetRecord, tx: DbTransaction): Promise<void> {
    try {
      await tx.insert(budgets).values({
        id: record.id,
        userId: record.userId,
        categoryId: record.categoryId,
        period: record.period,
        amount: this.cipher.encryptAmount(record.amountCents, aad.budgetAmount(record.id)),
        currency: record.currency,
        validFrom: record.validFrom,
        validTo: record.validTo,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    } catch (error) {
      if (isUniqueViolation(error, "budgets_active_uq")) throw new DuplicateEntryError("categoryId");
      throw error;
    }
  }

  async findOwned(userId: string, budgetId: string, tx?: DbTransaction, forUpdate = false): Promise<BudgetRecord | undefined> {
    const query = this.executor(tx)
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)));
    const [row] = forUpdate ? await query.for("update") : await query;
    return row ? this.toRecord(row) : undefined;
  }

  /** Orçamento em vigor (sem fim de vigência) da categoria e período. */
  async findActive(
    userId: string,
    categoryId: string,
    period: BudgetPeriod,
    tx?: DbTransaction,
  ): Promise<BudgetRecord | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(budgets)
      .where(
        and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId), eq(budgets.period, period), isNull(budgets.validTo)),
      );
    return row ? this.toRecord(row) : undefined;
  }

  /** Orçamentos que valem no mês "AAAA-MM" (a comparação de texto respeita a ordem dos meses). */
  async listInForce(userId: string, month: string): Promise<BudgetRecord[]> {
    return this.listInRange(userId, month, month);
  }

  /** Orçamentos com alguma vigência dentro do intervalo de meses (histórico — R23). */
  async listInRange(userId: string, fromMonth: string, toMonth: string): Promise<BudgetRecord[]> {
    const rows = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          lte(budgets.validFrom, toMonth),
          or(isNull(budgets.validTo), gte(budgets.validTo, fromMonth)),
        ),
      )
      .orderBy(asc(budgets.validFrom), asc(budgets.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  async hasAny(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: budgets.id }).from(budgets).where(eq(budgets.userId, userId)).limit(1);
    return row !== undefined;
  }

  async updateAmount(budgetId: string, amountCents: number, now: Date, tx: DbTransaction): Promise<void> {
    await tx
      .update(budgets)
      .set({ amount: this.cipher.encryptAmount(amountCents, aad.budgetAmount(budgetId)), updatedAt: now })
      .where(eq(budgets.id, budgetId));
  }

  /** Encerra a vigência: `validTo` é o último mês em que o orçamento vale. */
  async close(budgetId: string, validTo: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(budgets).set({ validTo, updatedAt: now }).where(eq(budgets.id, budgetId));
  }

  async delete(budgetId: string, tx: DbTransaction): Promise<void> {
    await tx.delete(budgets).where(eq(budgets.id, budgetId));
  }
}
