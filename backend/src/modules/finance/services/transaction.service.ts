import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction, TransactionRunner } from "../../../infrastructure/database/client.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import { todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import { decodeCursor, encodeCursor } from "../../../shared/utils/pagination.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ActionHistoryService } from "../../history/services/action-history.service.js";
import { UNDO_NOT_POSSIBLE } from "../../history/types/history.types.js";
import type { TransactionRepository } from "../repositories/transaction.repository.js";
import type {
  ArchiveResultResponseDto,
  CreateTransactionRequestDto,
  DuplicateTransactionRequestDto,
  ListTransactionsQueryDto,
  ParsedTransactionResponseDto,
  TransactionFiltersQueryDto,
  TransactionPageResponseDto,
  TransactionResponseDto,
  TransactionSummaryResponseDto,
  UpdateTransactionRequestDto,
} from "../schemas/transaction.schema.js";
import {
  balanceEffect,
  type MovementRange,
  sameState,
  type TransactionDetails,
  type TransactionMovement,
  type TransactionRecord,
  type TransactionState,
} from "../types/transaction.types.js";
import { addDelta, type BalanceDeltas } from "../types/wallet.types.js";
import type { CategoryService } from "./category.service.js";
import type { TagService } from "./tag.service.js";
import { parseTransactionText } from "./transaction-text-parser.js";
import type { WalletService } from "./wallet.service.js";

export interface TransactionServiceDeps {
  transactions: TransactionRepository;
  wallets: WalletService;
  categories: CategoryService;
  tags: TagService;
  history: ActionHistoryService;
  users: UserService;
  runner: TransactionRunner;
  clock: Clock;
}

type StateInput = UpdateTransactionRequestDto;

export function toTransactionResponseDto(details: TransactionDetails): TransactionResponseDto {
  return {
    id: details.id,
    type: details.type,
    amount: fromCents(details.amountCents),
    currency: details.currency,
    date: details.date,
    description: details.description,
    wallet: details.wallet,
    category: details.category,
    tags: details.tags,
    archived: details.archived,
    createdAt: details.createdAt.toISOString(),
    updatedAt: details.updatedAt.toISOString(),
  };
}

/**
 * Transações: registrar (R06), editar (R11), excluir (R12), duplicar (R48), arquivar (R52)
 * e consultar (R09, R10, R26, R70). Cada comando atualiza o saldo da carteira na mesma
 * transação de banco e registra a ação no histórico, para o "desfazer" (R49).
 */
export class TransactionService {
  constructor(private readonly deps: TransactionServiceDeps) {}

  // ================================================================ consultas

  async get(userId: string, transactionId: string): Promise<TransactionResponseDto> {
    const details = await this.deps.transactions.findDetails(userId, transactionId);
    if (!details) throw errors.notFound("Transação");
    return toTransactionResponseDto(details);
  }

  async list(userId: string, query: ListTransactionsQueryDto): Promise<TransactionPageResponseDto> {
    const { transactions } = this.deps;
    const { sort, order, limit, cursor, ...filters } = query;

    if (sort === "amount" || sort === "category") {
      const offset = cursor
        ? decodeCursor<{ o: number }>(cursor, (value) => Number.isInteger(value.o) && (value.o as number) >= 0).o
        : 0;
      const page =
        sort === "amount"
          ? await transactions.listByAmount(userId, filters, order, offset, limit)
          : await transactions.listByCategory(userId, filters, order, offset, limit);
      const hasMore = "total" in page ? offset + limit < page.total : page.hasMore;
      return {
        data: page.items.map(toTransactionResponseDto),
        nextCursor: hasMore ? encodeCursor({ o: offset + limit }) : null,
      };
    }

    const after = cursor
      ? decodeCursor<{ d: string; c: string; i: string }>(
          cursor,
          (value) => typeof value.d === "string" && typeof value.c === "string" && typeof value.i === "string",
        )
      : undefined;
    const page = await transactions.listByDate(
      userId,
      filters,
      order,
      limit,
      after ? { date: after.d, createdAt: after.c, id: after.i } : undefined,
    );
    const last = page.items[page.items.length - 1];
    return {
      data: page.items.map(toTransactionResponseDto),
      nextCursor:
        page.hasMore && last ? encodeCursor({ d: last.date, c: last.createdAt.toISOString(), i: last.id }) : null,
    };
  }

  /** Totais de receitas e despesas do filtro, por moeda (ex.: resumo do mês — R26). */
  async summary(userId: string, filters: TransactionFiltersQueryDto): Promise<TransactionSummaryResponseDto> {
    const rows = await this.deps.transactions.listAmounts(userId, filters);
    const byCurrency = new Map<string, { income: number; expense: number; count: number }>();
    for (const row of rows) {
      const entry = byCurrency.get(row.currency) ?? { income: 0, expense: 0, count: 0 };
      if (row.type === "income") entry.income += row.amountCents;
      else entry.expense += row.amountCents;
      entry.count += 1;
      byCurrency.set(row.currency, entry);
    }
    return {
      count: rows.length,
      totals: [...byCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, entry]) => ({
          currency,
          income: fromCents(entry.income),
          expense: fromCents(entry.expense),
          net: fromCents(entry.income - entry.expense),
          count: entry.count,
        })),
    };
  }

  /** R65: o app converte a voz em texto; aqui viramos rascunho + categorias sugeridas (R44). */
  async parse(userId: string, text: string): Promise<ParsedTransactionResponseDto> {
    const draft = parseTransactionText(text, await this.today(userId));
    const { suggestions } = await this.deps.categories.suggest(userId, draft.description);
    return {
      draft,
      suggestions: suggestions.map(({ categoryId, name, confidence }) => ({ categoryId, name, confidence })),
    };
  }

  /** Contrato público para o módulo reports. */
  listMovements(userId: string, range: MovementRange): Promise<TransactionMovement[]> {
    return this.deps.transactions.listMovements(userId, range);
  }

  // ================================================================ comandos

  async create(userId: string, input: CreateTransactionRequestDto): Promise<TransactionResponseDto> {
    const id = await this.deps.runner.run(async (tx) => {
      const state = await this.resolveState(tx, userId, { ...input, archived: false }, null);
      const transactionId = await this.insertTransaction(tx, userId, state);
      await this.deps.history.record(tx, userId, "transaction.create", "transaction", transactionId, { transactionId });
      return transactionId;
    });
    return this.get(userId, id);
  }

  async update(userId: string, transactionId: string, input: UpdateTransactionRequestDto): Promise<TransactionResponseDto> {
    await this.deps.runner.run(async (tx) => {
      const current = await this.deps.transactions.findForUpdate(userId, transactionId, false, tx);
      if (!current) throw errors.notFound("Transação");
      const before = stateOf(current);
      const after = await this.resolveState(tx, userId, input, before);
      if (sameState(before, after)) return;
      await this.writeState(tx, userId, transactionId, before, after);
      await this.deps.history.record(tx, userId, "transaction.update", "transaction", transactionId, {
        transactionId,
        before,
      });
    });
    return this.get(userId, transactionId);
  }

  /** Exclusão lógica: sai das listas e do saldo, mas pode ser restaurada pelo "desfazer". */
  async delete(userId: string, transactionId: string): Promise<void> {
    await this.deps.runner.run(async (tx) => {
      const current = await this.deps.transactions.findForUpdate(userId, transactionId, false, tx);
      if (!current) throw errors.notFound("Transação");
      await this.deps.transactions.softDelete(transactionId, this.deps.clock.now(), tx);
      await this.deps.wallets.applyBalanceDeltas(tx, userId, addDelta(new Map(), current.walletId, -balanceEffect(current)));
      await this.deps.history.record(tx, userId, "transaction.delete", "transaction", transactionId, { transactionId });
    });
  }

  /** R48: copia a transação; por padrão com a data de hoje, aceitando ajustes pontuais. */
  async duplicate(
    userId: string,
    transactionId: string,
    overrides: DuplicateTransactionRequestDto,
  ): Promise<TransactionResponseDto> {
    const id = await this.deps.runner.run(async (tx) => {
      const source = await this.deps.transactions.findActive(userId, transactionId, tx);
      if (!source) throw errors.notFound("Transação");
      const base: TransactionState = { ...stateOf(source), archived: false, date: await this.today(userId) };
      // Categoria excluída depois do registro original não é copiada.
      if (base.categoryId && overrides.categoryId === undefined && !(await this.deps.categories.isAssignable(userId, base.categoryId, tx))) {
        base.categoryId = null;
      }
      const state = await this.resolveState(tx, userId, { ...overrides, archived: false }, base);
      const newId = await this.insertTransaction(tx, userId, state);
      await this.deps.history.record(tx, userId, "transaction.create", "transaction", newId, { transactionId: newId });
      return newId;
    });
    return this.get(userId, id);
  }

  async setArchived(userId: string, transactionId: string, archived: boolean): Promise<TransactionResponseDto> {
    await this.deps.runner.run(async (tx) => {
      const current = await this.deps.transactions.findForUpdate(userId, transactionId, false, tx);
      if (!current) throw errors.notFound("Transação");
      if (current.archived === archived) return;
      await this.deps.transactions.setArchived(userId, [transactionId], archived, this.deps.clock.now(), tx);
      await this.deps.history.record(
        tx,
        userId,
        archived ? "transaction.archive" : "transaction.unarchive",
        "transaction",
        transactionId,
        { transactionId },
      );
    });
    return this.get(userId, transactionId);
  }

  /** R52: arquiva de uma vez as transações anteriores a uma data. */
  async archiveBefore(userId: string, beforeDate: string): Promise<ArchiveResultResponseDto> {
    return this.deps.runner.run(async (tx) => {
      const ids = await this.deps.transactions.archiveBefore(userId, beforeDate, this.deps.clock.now(), tx);
      if (ids.length > 0) {
        await this.deps.history.record(tx, userId, "transaction.bulk_archive", "transaction", null, {
          transactionIds: ids,
        });
      }
      return { archived: ids.length };
    });
  }

  // ================================================================ reversões do "desfazer" (R49)

  async revertCreate(tx: DbTransaction, userId: string, transactionId: string): Promise<void> {
    const current = await this.deps.transactions.findForUpdate(userId, transactionId, false, tx);
    if (!current) return; // já excluída: nada a reverter
    await this.deps.transactions.softDelete(transactionId, this.deps.clock.now(), tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, addDelta(new Map(), current.walletId, -balanceEffect(current)));
  }

  async revertDelete(tx: DbTransaction, userId: string, transactionId: string): Promise<void> {
    const deleted = await this.deps.transactions.findForUpdate(userId, transactionId, true, tx);
    if (!deleted) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transação excluída não está mais disponível para restauração.");
    }
    if (!(await this.deps.wallets.findOwned(userId, deleted.walletId, tx))) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A carteira da transação não existe mais.");
    }
    await this.deps.transactions.restore(transactionId, this.deps.clock.now(), tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, addDelta(new Map(), deleted.walletId, balanceEffect(deleted)));
  }

  async revertUpdate(tx: DbTransaction, userId: string, transactionId: string, rawBefore: unknown): Promise<void> {
    const current = await this.deps.transactions.findForUpdate(userId, transactionId, false, tx);
    if (!current) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transação editada foi excluída e não pode ser revertida.");
    }
    const before = rawBefore as TransactionState;
    if (!(await this.deps.wallets.findOwned(userId, before.walletId, tx))) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A carteira original da transação não existe mais.");
    }
    const target: TransactionState = {
      ...before,
      tagIds: await this.deps.tags.filterExisting(tx, userId, before.tagIds),
    };
    await this.writeState(tx, userId, transactionId, stateOf(current), target);
  }

  async revertArchive(tx: DbTransaction, userId: string, transactionIds: string[], archived: boolean): Promise<void> {
    await this.deps.transactions.setArchived(userId, transactionIds, archived, this.deps.clock.now(), tx);
  }

  // ================================================================ apoio

  private async today(userId: string): Promise<string> {
    const { timezone } = await this.deps.users.getPreferences(userId);
    return todayInTimeZone(this.deps.clock.now(), timezone);
  }

  /** Aplica a entrada sobre um estado base, validando posse de carteira, categoria e tags. */
  private async resolveState(
    tx: DbTransaction,
    userId: string,
    input: StateInput,
    base: TransactionState | null,
  ): Promise<TransactionState> {
    const { wallets, categories, tags } = this.deps;

    let walletId = base?.walletId;
    if (input.walletId !== undefined && input.walletId !== base?.walletId) {
      const wallet = await wallets.findOwned(userId, input.walletId, tx);
      if (!wallet) throw errors.unprocessable("INVALID_WALLET", "Carteira inexistente.");
      walletId = wallet.id;
    }
    if (!walletId) {
      const fallback = await wallets.findDefault(userId, tx);
      if (!fallback) throw errors.unprocessable("NO_WALLET", "Cadastre uma carteira antes de registrar transações.");
      walletId = fallback.id;
    }

    let categoryId = base?.categoryId ?? null;
    if (input.categoryId !== undefined && input.categoryId !== categoryId) {
      if (input.categoryId !== null) await categories.assertAssignable(userId, input.categoryId, tx);
      categoryId = input.categoryId;
    }

    const tagIds = input.tags !== undefined ? await tags.resolveNames(tx, userId, input.tags) : (base?.tagIds ?? []);
    const type = input.type ?? base?.type;
    const description = input.description?.trim() ?? base?.description;
    if (!type || !description) throw errors.validation("Tipo e descrição são obrigatórios.");

    return {
      walletId,
      type,
      amountCents: input.amount !== undefined ? toCents(input.amount) : (base?.amountCents ?? 0),
      date: input.date ?? base?.date ?? (await this.today(userId)),
      description,
      categoryId,
      archived: input.archived ?? base?.archived ?? false,
      tagIds,
    };
  }

  private async insertTransaction(tx: DbTransaction, userId: string, state: TransactionState): Promise<string> {
    if (state.amountCents <= 0) throw errors.validation("O valor deve ser maior que zero.");
    const id = randomUUID();
    await this.deps.transactions.insert({ ...state, id, userId, createdAt: this.deps.clock.now() }, tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, addDelta(new Map(), state.walletId, balanceEffect(state)));
    return id;
  }

  /** Grava o novo estado e recompõe os saldos afetados (inclusive troca de carteira). */
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
    await this.deps.transactions.updateState(transactionId, after, this.deps.clock.now(), tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, deltas);
  }
}

function stateOf(record: TransactionRecord): TransactionState {
  return {
    walletId: record.walletId,
    type: record.type,
    amountCents: record.amountCents,
    date: record.date,
    description: record.description,
    categoryId: record.categoryId,
    archived: record.archived,
    tagIds: record.tagIds,
  };
}
