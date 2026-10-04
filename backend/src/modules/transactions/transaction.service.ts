import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Database, DbTransaction } from "../../db/client.js";
import { transactionTags, transactions, users } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { todayInTimeZone } from "../../shared/dates.js";
import { AppError, errors } from "../../shared/errors.js";
import { toCents } from "../../shared/money.js";
import type { CategoryService } from "../categories/category.service.js";
import type { ActionHistory } from "../history/action-history.js";
import { UNDO_NOT_POSSIBLE } from "../history/undo-errors.js";
import type { TagService } from "../tags/tag.service.js";
import { addDelta, type BalanceDeltas, type BalanceLedger } from "../wallets/balance-ledger.js";
import type { WalletService } from "../wallets/wallet.service.js";
import type { TransactionQueries } from "./transaction.queries.js";
import {
  balanceEffect,
  sameState,
  type TransactionDto,
  type TransactionState,
  type TransactionType,
} from "./transaction.types.js";

export interface CreateTransactionInput {
  type: TransactionType;
  amount: number;
  description: string;
  date?: string | undefined;
  walletId?: string | undefined;
  categoryId?: string | null | undefined;
  tags?: string[] | undefined;
}

export interface UpdateTransactionInput {
  type?: TransactionType | undefined;
  amount?: number | undefined;
  description?: string | undefined;
  date?: string | undefined;
  walletId?: string | undefined;
  categoryId?: string | null | undefined;
  tags?: string[] | undefined;
  archived?: boolean | undefined;
}

export type DuplicateTransactionInput = Omit<UpdateTransactionInput, "archived">;

type TransactionRow = typeof transactions.$inferSelect;

/**
 * Comandos de transação: registrar (R06), editar (R11), excluir (R12), duplicar (R48),
 * arquivar (R52). Cada comando atualiza o saldo da carteira na mesma transação de banco
 * e registra a ação no histórico para o "desfazer" (R49).
 */
export class TransactionService {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly ledger: BalanceLedger,
    private readonly history: ActionHistory,
    private readonly wallets: WalletService,
    private readonly categories: CategoryService,
    private readonly tags: TagService,
    private readonly queries: TransactionQueries,
  ) {}

  // ---------- leitura de estado ----------

  private async lockRow(
    tx: DbTransaction,
    userId: string,
    transactionId: string,
    deleted: boolean,
  ): Promise<TransactionRow | undefined> {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          deleted ? isNotNull(transactions.deletedAt) : isNull(transactions.deletedAt),
        ),
      )
      .for("update");
    return row;
  }

  private async stateOf(tx: DbTransaction, row: TransactionRow): Promise<TransactionState> {
    const tagRows = await tx
      .select({ tagId: transactionTags.tagId })
      .from(transactionTags)
      .where(eq(transactionTags.transactionId, row.id));
    return {
      walletId: row.walletId,
      type: row.type as TransactionType,
      amountCents: this.cipher.decryptAmount(row.amount, aad.transactionAmount(row.id)),
      date: row.date,
      description: row.description,
      categoryId: row.categoryId,
      archived: row.archived,
      tagIds: tagRows.map((tag) => tag.tagId),
    };
  }

  private async today(tx: DbTransaction, userId: string): Promise<string> {
    const [user] = await tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
    return todayInTimeZone(this.clock.now(), user?.timezone ?? "America/Sao_Paulo");
  }

  /** Aplica a entrada sobre um estado base, validando posse de carteira, categoria e tags. */
  private async resolveState(
    tx: DbTransaction,
    userId: string,
    input: UpdateTransactionInput,
    base: TransactionState | null,
  ): Promise<TransactionState> {
    let walletId = base?.walletId;
    if (input.walletId !== undefined && input.walletId !== base?.walletId) {
      const wallet = await this.wallets.findOwned(tx, userId, input.walletId);
      if (!wallet) throw errors.unprocessable("INVALID_WALLET", "Carteira inexistente.");
      walletId = wallet.id;
    }
    if (!walletId) {
      const fallback = await this.wallets.findDefault(tx, userId);
      if (!fallback) {
        throw errors.unprocessable("NO_WALLET", "Cadastre uma carteira antes de registrar transações.");
      }
      walletId = fallback.id;
    }

    let categoryId = base?.categoryId ?? null;
    if (input.categoryId !== undefined && input.categoryId !== categoryId) {
      if (input.categoryId !== null) await this.categories.assertAssignable(tx, userId, input.categoryId);
      categoryId = input.categoryId;
    }

    const tagIds = input.tags !== undefined ? await this.tags.resolveNames(tx, userId, input.tags) : (base?.tagIds ?? []);

    const type = input.type ?? base?.type;
    const description = input.description?.trim() ?? base?.description;
    if (!type || !description) throw errors.validation("Tipo e descrição são obrigatórios.");

    return {
      walletId,
      type,
      amountCents: input.amount !== undefined ? toCents(input.amount) : (base?.amountCents ?? 0),
      date: input.date ?? base?.date ?? (await this.today(tx, userId)),
      description,
      categoryId,
      archived: input.archived ?? base?.archived ?? false,
      tagIds,
    };
  }

  // ---------- escrita ----------

  private async replaceTags(tx: DbTransaction, transactionId: string, tagIds: string[]): Promise<void> {
    await tx.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId));
    if (tagIds.length > 0) {
      await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })));
    }
  }

  private async insertTransaction(tx: DbTransaction, userId: string, state: TransactionState): Promise<string> {
    if (state.amountCents <= 0) throw errors.validation("O valor deve ser maior que zero.");
    const id = randomUUID();
    const now = this.clock.now();
    await tx.insert(transactions).values({
      id,
      userId,
      walletId: state.walletId,
      type: state.type,
      amount: this.cipher.encryptAmount(state.amountCents, aad.transactionAmount(id)),
      date: state.date,
      description: state.description,
      categoryId: state.categoryId,
      archived: state.archived,
      createdAt: now,
      updatedAt: now,
    });
    await this.replaceTags(tx, id, state.tagIds);
    await this.ledger.apply(tx, userId, addDelta(new Map(), state.walletId, balanceEffect(state)));
    return id;
  }

  /** Grava um novo estado sobre o anterior e recompõe os saldos afetados (inclusive troca de carteira). */
  private async writeState(
    tx: DbTransaction,
    userId: string,
    transactionId: string,
    before: TransactionState,
    after: TransactionState,
  ): Promise<void> {
    const deltas: BalanceDeltas = new Map();
    addDelta(deltas, before.walletId, -balanceEffect(before));
    addDelta(deltas, after.walletId, balanceEffect(after));
    await tx
      .update(transactions)
      .set({
        walletId: after.walletId,
        type: after.type,
        amount: this.cipher.encryptAmount(after.amountCents, aad.transactionAmount(transactionId)),
        date: after.date,
        description: after.description,
        categoryId: after.categoryId,
        archived: after.archived,
        updatedAt: this.clock.now(),
      })
      .where(eq(transactions.id, transactionId));
    await this.replaceTags(tx, transactionId, after.tagIds);
    await this.ledger.apply(tx, userId, deltas);
  }

  async create(userId: string, input: CreateTransactionInput): Promise<TransactionDto> {
    const id = await this.db.transaction(async (tx) => {
      const state = await this.resolveState(tx, userId, { ...input, archived: false }, null);
      const transactionId = await this.insertTransaction(tx, userId, state);
      await this.history.record(tx, userId, "transaction.create", "transaction", transactionId, { transactionId });
      return transactionId;
    });
    return this.queries.get(userId, id);
  }

  async update(userId: string, transactionId: string, input: UpdateTransactionInput): Promise<TransactionDto> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, userId, transactionId, false);
      if (!row) throw errors.notFound("Transação");
      const before = await this.stateOf(tx, row);
      const after = await this.resolveState(tx, userId, input, before);
      if (sameState(before, after)) return;
      await this.writeState(tx, userId, transactionId, before, after);
      await this.history.record(tx, userId, "transaction.update", "transaction", transactionId, {
        transactionId,
        before,
      });
    });
    return this.queries.get(userId, transactionId);
  }

  /** Exclusão lógica: some das listas e dos saldos, mas pode ser restaurada pelo "desfazer". */
  async delete(userId: string, transactionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, userId, transactionId, false);
      if (!row) throw errors.notFound("Transação");
      const state = await this.stateOf(tx, row);
      const now = this.clock.now();
      await tx.update(transactions).set({ deletedAt: now, updatedAt: now }).where(eq(transactions.id, transactionId));
      await this.ledger.apply(tx, userId, addDelta(new Map(), state.walletId, -balanceEffect(state)));
      await this.history.record(tx, userId, "transaction.delete", "transaction", transactionId, { transactionId });
    });
  }

  /** R48: copia a transação; por padrão com a data de hoje, aceitando ajustes pontuais. */
  async duplicate(userId: string, transactionId: string, overrides: DuplicateTransactionInput): Promise<TransactionDto> {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
      if (!row) throw errors.notFound("Transação");
      const source = await this.stateOf(tx, row);
      if (source.categoryId && overrides.categoryId === undefined) {
        // Categoria excluída depois do registro original não é copiada.
        try {
          await this.categories.assertAssignable(tx, userId, source.categoryId);
        } catch {
          source.categoryId = null;
        }
      }
      const base: TransactionState = { ...source, archived: false, date: await this.today(tx, userId) };
      const state = await this.resolveState(tx, userId, { ...overrides, archived: false }, base);
      const newId = await this.insertTransaction(tx, userId, state);
      await this.history.record(tx, userId, "transaction.create", "transaction", newId, { transactionId: newId });
      return newId;
    });
    return this.queries.get(userId, id);
  }

  async setArchived(userId: string, transactionId: string, archived: boolean): Promise<TransactionDto> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockRow(tx, userId, transactionId, false);
      if (!row) throw errors.notFound("Transação");
      if (row.archived === archived) return;
      await tx
        .update(transactions)
        .set({ archived, updatedAt: this.clock.now() })
        .where(eq(transactions.id, transactionId));
      await this.history.record(
        tx,
        userId,
        archived ? "transaction.archive" : "transaction.unarchive",
        "transaction",
        transactionId,
        { transactionId },
      );
    });
    return this.queries.get(userId, transactionId);
  }

  /** R52: arquiva de uma vez as transações anteriores a uma data. */
  async archiveBefore(userId: string, beforeDate: string): Promise<{ archived: number }> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({ archived: true, updatedAt: this.clock.now() })
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
            eq(transactions.archived, false),
            lt(transactions.date, beforeDate),
          ),
        )
        .returning({ id: transactions.id });
      if (updated.length > 0) {
        await this.history.record(tx, userId, "transaction.bulk_archive", "transaction", null, {
          transactionIds: updated.map((row) => row.id),
        });
      }
      return { archived: updated.length };
    });
  }

  // ---------- reversões usadas pelo "desfazer" (R49) ----------

  async revertCreate(tx: DbTransaction, userId: string, transactionId: string): Promise<void> {
    const row = await this.lockRow(tx, userId, transactionId, false);
    if (!row) return; // já excluída: nada a reverter
    const state = await this.stateOf(tx, row);
    const now = this.clock.now();
    await tx.update(transactions).set({ deletedAt: now, updatedAt: now }).where(eq(transactions.id, transactionId));
    await this.ledger.apply(tx, userId, addDelta(new Map(), state.walletId, -balanceEffect(state)));
  }

  async revertDelete(tx: DbTransaction, userId: string, transactionId: string): Promise<void> {
    const row = await this.lockRow(tx, userId, transactionId, true);
    if (!row) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transação excluída não está mais disponível para restauração.");
    }
    const state = await this.stateOf(tx, row);
    if (!(await this.wallets.findOwned(tx, userId, state.walletId))) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A carteira da transação não existe mais.");
    }
    await tx
      .update(transactions)
      .set({ deletedAt: null, updatedAt: this.clock.now() })
      .where(eq(transactions.id, transactionId));
    await this.ledger.apply(tx, userId, addDelta(new Map(), state.walletId, balanceEffect(state)));
  }

  async revertUpdate(tx: DbTransaction, userId: string, transactionId: string, rawBefore: unknown): Promise<void> {
    const row = await this.lockRow(tx, userId, transactionId, false);
    if (!row) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transação editada foi excluída e não pode ser revertida.");
    }
    const before = rawBefore as TransactionState;
    if (!(await this.wallets.findOwned(tx, userId, before.walletId))) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A carteira original da transação não existe mais.");
    }
    const current = await this.stateOf(tx, row);
    const target: TransactionState = {
      ...before,
      tagIds: await this.tags.filterExisting(tx, userId, before.tagIds),
    };
    await this.writeState(tx, userId, transactionId, current, target);
  }

  async revertArchive(tx: DbTransaction, userId: string, transactionIds: string[], archived: boolean): Promise<void> {
    if (transactionIds.length === 0) return;
    await tx
      .update(transactions)
      .set({ archived, updatedAt: this.clock.now() })
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds), isNull(transactions.deletedAt)),
      );
  }
}
