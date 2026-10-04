import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { transfers, wallets } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { MovementRange } from "../types/transaction.types.js";
import type { TransferCursor, TransferDetails, TransferFilters, TransferRecord } from "../types/transfer.types.js";

type TransferRow = typeof transfers.$inferSelect;

const sourceWallet = alias(wallets, "source_wallet");
const targetWallet = alias(wallets, "target_wallet");

/** Valores de saída e de entrada cifrados no banco (R81). */
export class TransferRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: TransferRow): TransferRecord {
    return {
      id: row.id,
      userId: row.userId,
      sourceWalletId: row.sourceWalletId,
      targetWalletId: row.targetWalletId,
      sourceCents: this.cipher.decryptAmount(row.sourceAmount, aad.transferSourceAmount(row.id)),
      targetCents: this.cipher.decryptAmount(row.targetAmount, aad.transferTargetAmount(row.id)),
      exchangeRate: row.exchangeRate,
      date: row.date,
      description: row.description,
      idempotencyKey: row.idempotencyKey,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
    };
  }

  private selectDetails() {
    return this.db
      .select({
        transfer: transfers,
        sourceName: sourceWallet.name,
        sourceCurrency: sourceWallet.currency,
        targetName: targetWallet.name,
        targetCurrency: targetWallet.currency,
      })
      .from(transfers)
      .innerJoin(sourceWallet, eq(sourceWallet.id, transfers.sourceWalletId))
      .innerJoin(targetWallet, eq(targetWallet.id, transfers.targetWalletId));
  }

  private toDetails(row: {
    transfer: TransferRow;
    sourceName: string;
    sourceCurrency: string;
    targetName: string;
    targetCurrency: string;
  }): TransferDetails {
    return {
      ...this.toRecord(row.transfer),
      sourceWallet: { id: row.transfer.sourceWalletId, name: row.sourceName, currency: row.sourceCurrency },
      targetWallet: { id: row.transfer.targetWalletId, name: row.targetName, currency: row.targetCurrency },
    };
  }

  async insert(record: Omit<TransferRecord, "deletedAt">, tx: DbTransaction): Promise<void> {
    try {
      await tx.insert(transfers).values({
        id: record.id,
        userId: record.userId,
        sourceWalletId: record.sourceWalletId,
        targetWalletId: record.targetWalletId,
        sourceAmount: this.cipher.encryptAmount(record.sourceCents, aad.transferSourceAmount(record.id)),
        targetAmount: this.cipher.encryptAmount(record.targetCents, aad.transferTargetAmount(record.id)),
        exchangeRate: record.exchangeRate,
        date: record.date,
        description: record.description,
        idempotencyKey: record.idempotencyKey,
        createdAt: record.createdAt,
      });
    } catch (error) {
      if (isUniqueViolation(error, "transfers_user_idempotency_uq")) throw new DuplicateEntryError("idempotencyKey");
      throw error;
    }
  }

  async findDetails(userId: string, transferId: string): Promise<TransferDetails | undefined> {
    const [row] = await this.selectDetails().where(
      and(eq(transfers.id, transferId), eq(transfers.userId, userId), isNull(transfers.deletedAt)),
    );
    return row ? this.toDetails(row) : undefined;
  }

  async findByIdempotencyKey(userId: string, key: string): Promise<TransferDetails | undefined> {
    const [row] = await this.selectDetails().where(
      and(eq(transfers.userId, userId), eq(transfers.idempotencyKey, key)),
    );
    return row ? this.toDetails(row) : undefined;
  }

  async list(
    userId: string,
    filters: TransferFilters,
    limit: number,
    after?: TransferCursor,
  ): Promise<{ items: TransferDetails[]; hasMore: boolean }> {
    const conditions: SQL[] = [eq(transfers.userId, userId), isNull(transfers.deletedAt)];
    if (filters.walletId) {
      conditions.push(or(eq(transfers.sourceWalletId, filters.walletId), eq(transfers.targetWalletId, filters.walletId))!);
    }
    if (filters.from) conditions.push(gte(transfers.date, filters.from));
    if (filters.to) conditions.push(lte(transfers.date, filters.to));
    if (after) {
      conditions.push(
        sql`(${transfers.date}, ${transfers.createdAt}, ${transfers.id}) < (${after.date}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid)`,
      );
    }
    const rows = await this.selectDetails()
      .where(and(...conditions))
      .orderBy(desc(transfers.date), desc(transfers.createdAt), desc(transfers.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit).map((row) => this.toDetails(row)), hasMore: rows.length > limit };
  }

  async findForUpdate(
    userId: string,
    transferId: string,
    deleted: boolean,
    tx: DbTransaction,
  ): Promise<TransferRecord | undefined> {
    const [row] = await tx
      .select()
      .from(transfers)
      .where(
        and(
          eq(transfers.id, transferId),
          eq(transfers.userId, userId),
          deleted ? isNotNull(transfers.deletedAt) : isNull(transfers.deletedAt),
        ),
      )
      .for("update");
    return row ? this.toRecord(row) : undefined;
  }

  async softDelete(transferId: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(transfers).set({ deletedAt: now }).where(eq(transfers.id, transferId));
  }

  async restore(transferId: string, tx: DbTransaction): Promise<void> {
    await tx.update(transfers).set({ deletedAt: null }).where(eq(transfers.id, transferId));
  }

  async countByWallet(walletId: string, onlyActive: boolean, tx: DbTransaction): Promise<number> {
    const involvesWallet = or(eq(transfers.sourceWalletId, walletId), eq(transfers.targetWalletId, walletId));
    const [row] = await tx
      .select({ value: count() })
      .from(transfers)
      .where(onlyActive ? and(involvesWallet, isNull(transfers.deletedAt)) : involvesWallet);
    return row?.value ?? 0;
  }

  async deleteAllByWallet(walletId: string, tx: DbTransaction): Promise<string[]> {
    const deleted = await tx
      .delete(transfers)
      .where(or(eq(transfers.sourceWalletId, walletId), eq(transfers.targetWalletId, walletId)))
      .returning({ id: transfers.id });
    return deleted.map((row) => row.id);
  }

  /** Transferências ativas no período, para relatórios. */
  async listForReports(userId: string, range: Pick<MovementRange, "from" | "to" | "before">): Promise<TransferRecord[]> {
    const conditions: SQL[] = [eq(transfers.userId, userId), isNull(transfers.deletedAt)];
    if (range.from) conditions.push(gte(transfers.date, range.from));
    if (range.to) conditions.push(lte(transfers.date, range.to));
    if (range.before) conditions.push(lt(transfers.date, range.before));
    const rows = await this.db
      .select()
      .from(transfers)
      .where(and(...conditions))
      .orderBy(asc(transfers.date), asc(transfers.createdAt), asc(transfers.id));
    return rows.map((row) => this.toRecord(row));
  }
}
