import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database, DbTransaction } from "../../db/client.js";
import { transfers, users, wallets } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { todayInTimeZone } from "../../shared/dates.js";
import { AppError, errors } from "../../shared/errors.js";
import { convertCents, fromCents, impliedRate, toCents } from "../../shared/money.js";
import { decodeCursor, encodeCursor } from "../../shared/pagination.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";
import type { ExchangeRateService } from "../exchange-rates/exchange-rate.service.js";
import type { ActionHistory } from "../history/action-history.js";
import { UNDO_NOT_POSSIBLE } from "../history/undo-errors.js";
import { addDelta, type BalanceLedger } from "../wallets/balance-ledger.js";
import type { WalletService } from "../wallets/wallet.service.js";

export interface TransferDto {
  id: string;
  sourceWallet: { id: string; name: string; currency: string };
  targetWallet: { id: string; name: string; currency: string };
  amount: number;
  targetAmount: number;
  exchangeRate: number | null;
  date: string;
  description: string | null;
  createdAt: string;
}

export interface CreateTransferInput {
  sourceWalletId: string;
  targetWalletId: string;
  amount: number;
  targetAmount?: number | undefined;
  date?: string | undefined;
  description?: string | undefined;
}

export interface TransferListQuery {
  walletId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

type TransferRow = typeof transfers.$inferSelect;

const sourceWallet = alias(wallets, "source_wallet");
const targetWallet = alias(wallets, "target_wallet");

/**
 * Transferências entre carteiras (R54): debita a origem e credita o destino na mesma
 * transação de banco, sem gerar receita nem despesa. Entre moedas diferentes (R56),
 * converte com a cotação atual (R29) ou com o valor de destino informado.
 */
export class TransferService {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly ledger: BalanceLedger,
    private readonly history: ActionHistory,
    private readonly wallets: WalletService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  private selectWithWallets() {
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

  private toDto(row: {
    transfer: TransferRow;
    sourceName: string;
    sourceCurrency: string;
    targetName: string;
    targetCurrency: string;
  }): TransferDto {
    const { transfer } = row;
    return {
      id: transfer.id,
      sourceWallet: { id: transfer.sourceWalletId, name: row.sourceName, currency: row.sourceCurrency },
      targetWallet: { id: transfer.targetWalletId, name: row.targetName, currency: row.targetCurrency },
      amount: fromCents(this.cipher.decryptAmount(transfer.sourceAmount, aad.transferSourceAmount(transfer.id))),
      targetAmount: fromCents(this.cipher.decryptAmount(transfer.targetAmount, aad.transferTargetAmount(transfer.id))),
      exchangeRate: transfer.exchangeRate === null ? null : Number(transfer.exchangeRate),
      date: transfer.date,
      description: transfer.description,
      createdAt: transfer.createdAt.toISOString(),
    };
  }

  async get(userId: string, transferId: string): Promise<TransferDto> {
    const [row] = await this.selectWithWallets().where(
      and(eq(transfers.id, transferId), eq(transfers.userId, userId), isNull(transfers.deletedAt)),
    );
    if (!row) throw errors.notFound("Transferência");
    return this.toDto(row);
  }

  async list(userId: string, query: TransferListQuery): Promise<{ data: TransferDto[]; nextCursor: string | null }> {
    const conditions: SQL[] = [eq(transfers.userId, userId), isNull(transfers.deletedAt)];
    if (query.walletId) {
      conditions.push(or(eq(transfers.sourceWalletId, query.walletId), eq(transfers.targetWalletId, query.walletId))!);
    }
    if (query.from) conditions.push(gte(transfers.date, query.from));
    if (query.to) conditions.push(lte(transfers.date, query.to));
    if (query.cursor) {
      const cursor = decodeCursor<{ d: string; c: string; i: string }>(
        query.cursor,
        (value) => typeof value.d === "string" && typeof value.c === "string" && typeof value.i === "string",
      );
      conditions.push(
        sql`(${transfers.date}, ${transfers.createdAt}, ${transfers.id}) < (${cursor.d}::date, ${cursor.c}::timestamptz, ${cursor.i}::uuid)`,
      );
    }
    const rows = await this.selectWithWallets()
      .where(and(...conditions))
      .orderBy(desc(transfers.date), desc(transfers.createdAt), desc(transfers.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1]?.transfer;
    return {
      data: page.map((row) => this.toDto(row)),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ d: last.date, c: last.createdAt.toISOString(), i: last.id })
          : null,
    };
  }

  /**
   * Cria a transferência. Com `idempotencyKey`, repetir a mesma requisição (ex.: nova
   * tentativa após falha de rede) devolve a transferência original sem duplicar o débito.
   */
  async create(
    userId: string,
    input: CreateTransferInput,
    idempotencyKey?: string,
  ): Promise<{ transfer: TransferDto; created: boolean }> {
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return { transfer: existing, created: false };
    }
    if (input.sourceWalletId === input.targetWalletId) {
      throw errors.validation("As carteiras de origem e destino devem ser diferentes.");
    }

    const source = await this.wallets.findOwned(this.db, userId, input.sourceWalletId);
    const target = await this.wallets.findOwned(this.db, userId, input.targetWalletId);
    if (!source || !target) throw errors.unprocessable("INVALID_WALLET", "Carteira de origem ou destino inexistente.");

    const sourceCents = toCents(input.amount);
    let targetCents: number;
    let rate: string | null = null;
    if (source.currency === target.currency) {
      if (input.targetAmount !== undefined && toCents(input.targetAmount, "targetAmount") !== sourceCents) {
        throw errors.validation("Entre carteiras da mesma moeda, o valor de destino deve ser igual ao de origem.");
      }
      targetCents = sourceCents;
    } else if (input.targetAmount !== undefined) {
      targetCents = toCents(input.targetAmount, "targetAmount");
      rate = impliedRate(sourceCents, targetCents);
    } else {
      const quote = await this.exchangeRates.getQuote(source.currency, target.currency);
      rate = quote.rate;
      targetCents = convertCents(sourceCents, rate);
    }
    if (targetCents <= 0) throw errors.validation("O valor convertido deve ser maior que zero.");

    const id = randomUUID();
    const now = this.clock.now();
    const [owner] = await this.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
    const date = input.date ?? todayInTimeZone(now, owner?.timezone ?? "America/Sao_Paulo");
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(transfers).values({
          id,
          userId,
          sourceWalletId: source.id,
          targetWalletId: target.id,
          sourceAmount: this.cipher.encryptAmount(sourceCents, aad.transferSourceAmount(id)),
          targetAmount: this.cipher.encryptAmount(targetCents, aad.transferTargetAmount(id)),
          exchangeRate: rate,
          date,
          description: input.description?.trim() || null,
          idempotencyKey: idempotencyKey ?? null,
          createdAt: now,
        });
        const deltas = addDelta(new Map(), source.id, -sourceCents);
        addDelta(deltas, target.id, targetCents);
        await this.ledger.apply(tx, userId, deltas);
        await this.history.record(tx, userId, "transfer.create", "transfer", id, { transferId: id });
      });
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error, "transfers_user_idempotency_uq")) {
        const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
        if (existing) return { transfer: existing, created: false };
      }
      throw error;
    }
    return { transfer: await this.get(userId, id), created: true };
  }

  private async findByIdempotencyKey(userId: string, key: string): Promise<TransferDto | null> {
    const [row] = await this.selectWithWallets().where(
      and(eq(transfers.userId, userId), eq(transfers.idempotencyKey, key)),
    );
    return row ? this.toDto(row) : null;
  }

  private async lockRow(tx: DbTransaction, userId: string, transferId: string, deleted: boolean) {
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
    return row;
  }

  private effects(row: TransferRow, sign: 1 | -1) {
    const sourceCents = this.cipher.decryptAmount(row.sourceAmount, aad.transferSourceAmount(row.id));
    const targetCents = this.cipher.decryptAmount(row.targetAmount, aad.transferTargetAmount(row.id));
    const deltas = addDelta(new Map(), row.sourceWalletId, -sourceCents * sign);
    return addDelta(deltas, row.targetWalletId, targetCents * sign);
  }

  async delete(userId: string, transferId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, userId, transferId, false);
      if (!row) throw errors.notFound("Transferência");
      await tx.update(transfers).set({ deletedAt: this.clock.now() }).where(eq(transfers.id, transferId));
      await this.ledger.apply(tx, userId, this.effects(row, -1));
      await this.history.record(tx, userId, "transfer.delete", "transfer", transferId, { transferId });
    });
  }

  async revertCreate(tx: DbTransaction, userId: string, transferId: string): Promise<void> {
    const row = await this.lockRow(tx, userId, transferId, false);
    if (!row) return;
    await tx.update(transfers).set({ deletedAt: this.clock.now() }).where(eq(transfers.id, transferId));
    await this.ledger.apply(tx, userId, this.effects(row, -1));
  }

  async revertDelete(tx: DbTransaction, userId: string, transferId: string): Promise<void> {
    const row = await this.lockRow(tx, userId, transferId, true);
    if (!row) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transferência excluída não está mais disponível para restauração.");
    }
    await tx.update(transfers).set({ deletedAt: null }).where(eq(transfers.id, transferId));
    await this.ledger.apply(tx, userId, this.effects(row, 1));
  }

  /** Transferências ativas no período, com valores decifrados — usadas pelos relatórios. */
  async loadForReports(
    userId: string,
    range: { from?: string; to?: string; before?: string },
  ): Promise<
    Array<{
      id: string;
      date: string;
      createdAt: Date;
      description: string | null;
      sourceWalletId: string;
      targetWalletId: string;
      sourceCents: number;
      targetCents: number;
    }>
  > {
    const conditions: SQL[] = [eq(transfers.userId, userId), isNull(transfers.deletedAt)];
    if (range.from) conditions.push(gte(transfers.date, range.from));
    if (range.to) conditions.push(lte(transfers.date, range.to));
    if (range.before) conditions.push(sql`${transfers.date} < ${range.before}`);
    const rows = await this.db
      .select()
      .from(transfers)
      .where(and(...conditions))
      .orderBy(asc(transfers.date), asc(transfers.createdAt), asc(transfers.id));
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      createdAt: row.createdAt,
      description: row.description,
      sourceWalletId: row.sourceWalletId,
      targetWalletId: row.targetWalletId,
      sourceCents: this.cipher.decryptAmount(row.sourceAmount, aad.transferSourceAmount(row.id)),
      targetCents: this.cipher.decryptAmount(row.targetAmount, aad.transferTargetAmount(row.id)),
    }));
  }
}
