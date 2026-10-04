import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction, TransactionRunner } from "../../../infrastructure/database/client.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { todayInTimeZone } from "../../../shared/utils/dates.js";
import { convertCents, fromCents, impliedRate, toCents } from "../../../shared/utils/money.js";
import { decodeCursor, encodeCursor } from "../../../shared/utils/pagination.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ActionHistoryService } from "../../history/services/action-history.service.js";
import { UNDO_NOT_POSSIBLE } from "../../history/types/history.types.js";
import type { TransferRepository } from "../repositories/transfer.repository.js";
import type {
  CreateTransferRequestDto,
  ListTransfersQueryDto,
  TransferPageResponseDto,
  TransferResponseDto,
} from "../schemas/transfer.schema.js";
import type { MovementRange } from "../types/transaction.types.js";
import type { TransferDetails, TransferRecord } from "../types/transfer.types.js";
import { addDelta, type BalanceDeltas } from "../types/wallet.types.js";
import type { ExchangeRateService } from "./exchange-rate.service.js";
import type { WalletService } from "./wallet.service.js";

export interface TransferServiceDeps {
  transfers: TransferRepository;
  wallets: WalletService;
  history: ActionHistoryService;
  exchangeRates: ExchangeRateService;
  users: UserService;
  runner: TransactionRunner;
  clock: Clock;
}

export function toTransferResponseDto(details: TransferDetails): TransferResponseDto {
  return {
    id: details.id,
    sourceWallet: details.sourceWallet,
    targetWallet: details.targetWallet,
    amount: fromCents(details.sourceCents),
    targetAmount: fromCents(details.targetCents),
    exchangeRate: details.exchangeRate === null ? null : Number(details.exchangeRate),
    date: details.date,
    description: details.description,
    createdAt: details.createdAt.toISOString(),
  };
}

/** Efeito no saldo: sai da origem e entra no destino (sinal invertido para estornar). */
function balanceDeltas(transfer: TransferRecord, sign: 1 | -1): BalanceDeltas {
  const deltas = addDelta(new Map(), transfer.sourceWalletId, -transfer.sourceCents * sign);
  return addDelta(deltas, transfer.targetWalletId, transfer.targetCents * sign);
}

/**
 * Transferências entre carteiras (R54): debita a origem e credita o destino na mesma
 * transação de banco, sem gerar receita nem despesa. Entre moedas diferentes (R56),
 * converte pela cotação atual (R29) ou pelo valor de destino informado.
 */
export class TransferService {
  constructor(private readonly deps: TransferServiceDeps) {}

  async get(userId: string, transferId: string): Promise<TransferResponseDto> {
    const details = await this.deps.transfers.findDetails(userId, transferId);
    if (!details) throw errors.notFound("Transferência");
    return toTransferResponseDto(details);
  }

  async list(userId: string, query: ListTransfersQueryDto): Promise<TransferPageResponseDto> {
    const { limit, cursor, ...filters } = query;
    const after = cursor
      ? decodeCursor<{ d: string; c: string; i: string }>(
          cursor,
          (value) => typeof value.d === "string" && typeof value.c === "string" && typeof value.i === "string",
        )
      : undefined;
    const page = await this.deps.transfers.list(
      userId,
      filters,
      limit,
      after ? { date: after.d, createdAt: after.c, id: after.i } : undefined,
    );
    const last = page.items[page.items.length - 1];
    return {
      data: page.items.map(toTransferResponseDto),
      nextCursor:
        page.hasMore && last ? encodeCursor({ d: last.date, c: last.createdAt.toISOString(), i: last.id }) : null,
    };
  }

  /**
   * Com `idempotencyKey`, repetir a requisição (ex.: nova tentativa após falha de rede)
   * devolve a transferência original, sem debitar duas vezes.
   */
  async create(
    userId: string,
    input: CreateTransferRequestDto,
    idempotencyKey?: string,
  ): Promise<{ transfer: TransferResponseDto; created: boolean }> {
    const { transfers, wallets, history, exchangeRates, users, runner, clock } = this.deps;
    if (idempotencyKey) {
      const existing = await transfers.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) return { transfer: toTransferResponseDto(existing), created: false };
    }
    if (input.sourceWalletId === input.targetWalletId) {
      throw errors.validation("As carteiras de origem e destino devem ser diferentes.");
    }

    const source = await wallets.findOwned(userId, input.sourceWalletId);
    const target = await wallets.findOwned(userId, input.targetWalletId);
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
      const quote = await exchangeRates.getQuote(source.currency, target.currency);
      rate = quote.rate;
      targetCents = convertCents(sourceCents, rate);
    }
    if (targetCents <= 0) throw errors.validation("O valor convertido deve ser maior que zero.");

    const now = clock.now();
    const { timezone } = await users.getPreferences(userId);
    const record: Omit<TransferRecord, "deletedAt"> = {
      id: randomUUID(),
      userId,
      sourceWalletId: source.id,
      targetWalletId: target.id,
      sourceCents,
      targetCents,
      exchangeRate: rate,
      date: input.date ?? todayInTimeZone(now, timezone),
      description: input.description?.trim() || null,
      idempotencyKey: idempotencyKey ?? null,
      createdAt: now,
    };

    try {
      await runner.run(async (tx) => {
        await transfers.insert(record, tx);
        await wallets.applyBalanceDeltas(tx, userId, balanceDeltas({ ...record, deletedAt: null }, 1));
        await history.record(tx, userId, "transfer.create", "transfer", record.id, { transferId: record.id });
      });
    } catch (error) {
      if (idempotencyKey && error instanceof DuplicateEntryError) {
        const existing = await transfers.findByIdempotencyKey(userId, idempotencyKey);
        if (existing) return { transfer: toTransferResponseDto(existing), created: false };
      }
      throw error;
    }
    return { transfer: await this.get(userId, record.id), created: true };
  }

  async delete(userId: string, transferId: string): Promise<void> {
    const { transfers, wallets, history, runner, clock } = this.deps;
    await runner.run(async (tx) => {
      const transfer = await transfers.findForUpdate(userId, transferId, false, tx);
      if (!transfer) throw errors.notFound("Transferência");
      await transfers.softDelete(transferId, clock.now(), tx);
      await wallets.applyBalanceDeltas(tx, userId, balanceDeltas(transfer, -1));
      await history.record(tx, userId, "transfer.delete", "transfer", transferId, { transferId });
    });
  }

  // ---------- reversões do "desfazer" (R49) ----------

  async revertCreate(tx: DbTransaction, userId: string, transferId: string): Promise<void> {
    const transfer = await this.deps.transfers.findForUpdate(userId, transferId, false, tx);
    if (!transfer) return;
    await this.deps.transfers.softDelete(transferId, this.deps.clock.now(), tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, balanceDeltas(transfer, -1));
  }

  async revertDelete(tx: DbTransaction, userId: string, transferId: string): Promise<void> {
    const transfer = await this.deps.transfers.findForUpdate(userId, transferId, true, tx);
    if (!transfer) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A transferência excluída não está mais disponível para restauração.");
    }
    await this.deps.transfers.restore(transferId, tx);
    await this.deps.wallets.applyBalanceDeltas(tx, userId, balanceDeltas(transfer, 1));
  }

  /** Contrato público para o módulo reports. */
  listForReports(userId: string, range: Pick<MovementRange, "from" | "to" | "before">): Promise<TransferRecord[]> {
    return this.deps.transfers.listForReports(userId, range);
  }
}
