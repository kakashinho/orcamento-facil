import { and, asc, count, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { transactionSeries } from "../../../infrastructure/database/schema.js";
import type { TransactionType } from "../types/transaction.types.js";
import type { SeriesChanges, SeriesFrequency, SeriesKind, SeriesRecord, SeriesStatus } from "../types/series.types.js";

type SeriesRow = typeof transactionSeries.$inferSelect;

/** Recorrências e parcelamentos (R37, R62). O valor é cifrado (R81). */
export class SeriesRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: SeriesRow): SeriesRecord {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as SeriesKind,
      type: row.type as TransactionType,
      frequency: row.frequency as SeriesFrequency,
      walletId: row.walletId,
      categoryId: row.categoryId,
      description: row.description,
      tagIds: row.tagIds,
      amountCents: this.cipher.decryptAmount(row.amount, aad.seriesAmount(row.id)),
      installments: row.installments,
      startDate: row.startDate,
      anchorDay: row.anchorDay,
      endDate: row.endDate,
      nextDate: row.nextDate,
      generatedCount: row.generatedCount,
      status: row.status as SeriesStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(record: SeriesRecord, tx: DbTransaction): Promise<void> {
    await tx.insert(transactionSeries).values({
      id: record.id,
      userId: record.userId,
      kind: record.kind,
      type: record.type,
      frequency: record.frequency,
      walletId: record.walletId,
      categoryId: record.categoryId,
      description: record.description,
      tagIds: record.tagIds,
      amount: this.cipher.encryptAmount(record.amountCents, aad.seriesAmount(record.id)),
      installments: record.installments,
      startDate: record.startDate,
      anchorDay: record.anchorDay,
      endDate: record.endDate,
      nextDate: record.nextDate,
      generatedCount: record.generatedCount,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findOwned(userId: string, seriesId: string, tx?: DbTransaction, forUpdate = false): Promise<SeriesRecord | undefined> {
    const query = this.executor(tx)
      .select()
      .from(transactionSeries)
      .where(and(eq(transactionSeries.id, seriesId), eq(transactionSeries.userId, userId)));
    const [row] = forUpdate ? await query.for("update") : await query;
    return row ? this.toRecord(row) : undefined;
  }

  async list(userId: string, statuses: SeriesStatus[]): Promise<SeriesRecord[]> {
    const rows = await this.db
      .select()
      .from(transactionSeries)
      .where(and(eq(transactionSeries.userId, userId), inArray(transactionSeries.status, statuses)))
      .orderBy(asc(transactionSeries.nextDate), asc(transactionSeries.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  /** Séries ativas com próxima ocorrência até `maxDate` (o fuso de cada dono é conferido no service). */
  async listDueCandidates(maxDate: string, limit: number, afterId?: string): Promise<Array<{ id: string; userId: string }>> {
    return this.db
      .select({ id: transactionSeries.id, userId: transactionSeries.userId })
      .from(transactionSeries)
      .where(
        and(
          eq(transactionSeries.status, "active"),
          lte(transactionSeries.nextDate, maxDate),
          ...(afterId ? [gt(transactionSeries.id, afterId)] : []),
        ),
      )
      .orderBy(asc(transactionSeries.id))
      .limit(limit);
  }

  async update(seriesId: string, changes: SeriesChanges, tx?: DbTransaction): Promise<void> {
    const { amountCents, ...plain } = changes;
    await this.executor(tx)
      .update(transactionSeries)
      .set({
        ...plain,
        ...(amountCents === undefined ? {} : { amount: this.cipher.encryptAmount(amountCents, aad.seriesAmount(seriesId)) }),
      })
      .where(eq(transactionSeries.id, seriesId));
  }

  async countActiveByWallet(walletId: string, tx: DbTransaction): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(transactionSeries)
      .where(and(eq(transactionSeries.walletId, walletId), eq(transactionSeries.status, "active")));
    return row?.value ?? 0;
  }

  /** Remove as séries encerradas ou canceladas da carteira (antes de excluí-la). */
  async deleteInactiveByWallet(walletId: string, tx: DbTransaction): Promise<void> {
    await tx
      .delete(transactionSeries)
      .where(and(eq(transactionSeries.walletId, walletId), ne(transactionSeries.status, "active")));
  }
}
