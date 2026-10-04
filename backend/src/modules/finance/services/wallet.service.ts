import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction, TransactionRunner } from "../../../infrastructure/database/client.js";
import { errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ActionHistoryService } from "../../history/services/action-history.service.js";
import type { TransactionRepository } from "../repositories/transaction.repository.js";
import type { TransferRepository } from "../repositories/transfer.repository.js";
import type { WalletRepository } from "../repositories/wallet.repository.js";
import type {
  CreateWalletRequestDto,
  UpdateWalletRequestDto,
  WalletListResponseDto,
  WalletResponseDto,
  WalletSummaryResponseDto,
} from "../schemas/wallet.schema.js";
import type { BalanceDeltas, Wallet, WalletChanges } from "../types/wallet.types.js";
import type { ExchangeRateService } from "./exchange-rate.service.js";

export interface WalletServiceDeps {
  wallets: WalletRepository;
  transactions: TransactionRepository;
  transfers: TransferRepository;
  history: ActionHistoryService;
  users: UserService;
  exchangeRates: ExchangeRateService;
  runner: TransactionRunner;
  clock: Clock;
}

const DEFAULT_WALLET_NAME = "Carteira";

export function toWalletResponseDto(wallet: Wallet): WalletResponseDto {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    currency: wallet.currency,
    isDefault: wallet.isDefault,
    balance: fromCents(wallet.balanceCents),
    initialBalance: fromCents(wallet.initialBalanceCents),
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

/** Carteiras (R53), moeda por carteira (R56) e saldo atualizado (R55). */
export class WalletService {
  constructor(private readonly deps: WalletServiceDeps) {}

  private nameTaken(): never {
    throw errors.conflict("WALLET_NAME_TAKEN", "Você já possui uma carteira com esse nome.");
  }

  async list(userId: string): Promise<WalletListResponseDto> {
    const wallets = await this.deps.wallets.listByUser(userId);
    return { data: wallets.map(toWalletResponseDto) };
  }

  async get(userId: string, walletId: string): Promise<WalletResponseDto> {
    const wallet = await this.deps.wallets.findById(userId, walletId);
    if (!wallet) throw errors.notFound("Carteira");
    return toWalletResponseDto(wallet);
  }

  async create(userId: string, input: CreateWalletRequestDto): Promise<WalletResponseDto> {
    const { wallets, users, exchangeRates, runner, clock } = this.deps;
    const preferences = await users.getPreferences(userId);
    const currency = input.currency ?? preferences.primaryCurrency;
    exchangeRates.assertCurrency(currency);
    const initialCents = toCents(input.initialBalance ?? 0, "initialBalance");
    const id = randomUUID();
    const now = clock.now();

    try {
      await runner.run(async (tx) => {
        const currentDefault = await wallets.findDefault(userId, tx);
        const makeDefault = input.isDefault === true || !currentDefault;
        if (makeDefault && currentDefault) await wallets.clearDefault(userId, now, tx);
        await wallets.insert(
          {
            id,
            userId,
            name: input.name.trim(),
            type: input.type ?? "other",
            currency,
            isDefault: makeDefault,
            initialBalanceCents: initialCents,
            balanceCents: initialCents,
            createdAt: now,
            updatedAt: now,
          },
          tx,
        );
      });
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
    return this.get(userId, id);
  }

  async update(userId: string, walletId: string, input: UpdateWalletRequestDto): Promise<WalletResponseDto> {
    const { wallets, transactions, transfers, exchangeRates, runner, clock } = this.deps;
    const now = clock.now();
    try {
      await runner.run(async (tx) => {
        const wallet = await wallets.findByIdForUpdate(userId, walletId, tx);
        if (!wallet) throw errors.notFound("Carteira");

        const changes: WalletChanges = { updatedAt: now };
        if (input.name !== undefined) changes.name = input.name.trim();
        if (input.type !== undefined) changes.type = input.type;

        if (input.currency !== undefined && input.currency !== wallet.currency) {
          exchangeRates.assertCurrency(input.currency);
          const movements =
            (await transactions.countByWallet(walletId, false, tx)) + (await transfers.countByWallet(walletId, false, tx));
          if (movements > 0) {
            throw errors.conflict(
              "WALLET_HAS_MOVEMENTS",
              "Não é possível alterar a moeda de uma carteira que já possui movimentações.",
            );
          }
          changes.currency = input.currency;
        }

        if (input.initialBalance !== undefined) {
          const newInitial = toCents(input.initialBalance, "initialBalance");
          changes.initialBalanceCents = newInitial;
          changes.balanceCents = wallet.balanceCents + newInitial - wallet.initialBalanceCents;
        }

        if (input.isDefault === true && !wallet.isDefault) {
          await wallets.clearDefault(userId, now, tx);
          changes.isDefault = true;
        }

        await wallets.update(walletId, changes, tx);
      });
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
    return this.get(userId, walletId);
  }

  /**
   * Exclui uma carteira sem movimentações ativas. Transações e transferências já excluídas
   * (mantidas só para o "desfazer") saem definitivamente, junto com o histórico delas.
   */
  async delete(userId: string, walletId: string): Promise<void> {
    const { wallets, transactions, transfers, history, runner, clock } = this.deps;
    await runner.run(async (tx) => {
      const wallet = await wallets.findByIdForUpdate(userId, walletId, tx);
      if (!wallet) throw errors.notFound("Carteira");

      const active = {
        transactions: await transactions.countByWallet(walletId, true, tx),
        transfers: await transfers.countByWallet(walletId, true, tx),
      };
      if (active.transactions + active.transfers > 0) {
        throw errors.conflict(
          "WALLET_NOT_EMPTY",
          "A carteira possui movimentações. Exclua ou mova as transações e transferências antes de excluí-la.",
          active,
        );
      }

      const purged = [
        ...(await transactions.deleteAllByWallet(walletId, tx)),
        ...(await transfers.deleteAllByWallet(walletId, tx)),
      ];
      await history.purgeEntities(tx, userId, purged);
      await wallets.delete(walletId, tx);

      if (wallet.isDefault) {
        const next = await wallets.findOldest(userId, tx);
        if (next) await wallets.update(next.id, { isDefault: true, updatedAt: clock.now() }, tx);
      }
    });
  }

  /** Tela inicial: saldo de cada carteira e total convertido para a moeda principal (R55, R28, R29). */
  async summary(userId: string): Promise<WalletSummaryResponseDto> {
    const { wallets, users, exchangeRates } = this.deps;
    const { primaryCurrency } = await users.getPreferences(userId);
    const list = await wallets.listByUser(userId);

    let total = 0;
    let complete = true;
    let ratesUpdatedAt: Date | null = null;
    let ratesStale = false;
    const items: WalletSummaryResponseDto["wallets"] = [];

    for (const wallet of list) {
      const dto = toWalletResponseDto(wallet);
      if (wallet.currency === primaryCurrency) {
        total += wallet.balanceCents;
        items.push({ ...dto, balanceInPrimaryCurrency: dto.balance });
        continue;
      }
      try {
        const { cents, quote } = await exchangeRates.convert(wallet.balanceCents, wallet.currency, primaryCurrency);
        total += cents;
        ratesUpdatedAt = quote.updatedAt;
        ratesStale ||= quote.stale;
        items.push({ ...dto, balanceInPrimaryCurrency: fromCents(cents) });
      } catch {
        complete = false;
        items.push({ ...dto, balanceInPrimaryCurrency: null });
      }
    }

    return {
      primaryCurrency,
      totalBalance: complete ? fromCents(total) : null,
      ratesUpdatedAt: ratesUpdatedAt ? ratesUpdatedAt.toISOString() : null,
      ratesStale,
      wallets: items,
    };
  }

  // ---------- contrato usado por transações, transferências, relatórios e cadastro ----------

  findOwned(userId: string, walletId: string, tx?: DbTransaction): Promise<Wallet | undefined> {
    return this.deps.wallets.findById(userId, walletId, tx);
  }

  findDefault(userId: string, tx?: DbTransaction): Promise<Wallet | undefined> {
    return this.deps.wallets.findDefault(userId, tx);
  }

  listForReports(userId: string): Promise<Wallet[]> {
    return this.deps.wallets.listByUser(userId);
  }

  /** Carteira inicial criada no cadastro, para o usuário já poder registrar transações. */
  async createDefaultWallet(tx: DbTransaction, user: { id: string; primaryCurrency: string }): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.wallets.insert(
      {
        id: randomUUID(),
        userId: user.id,
        name: DEFAULT_WALLET_NAME,
        type: "cash",
        currency: user.primaryCurrency,
        isDefault: true,
        initialBalanceCents: 0,
        balanceCents: 0,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );
  }

  /**
   * Aplica variações ao saldo materializado (R55) dentro da transação do movimento. As
   * carteiras ficam bloqueadas até o commit, então movimentos simultâneos não se perdem.
   */
  async applyBalanceDeltas(tx: DbTransaction, userId: string, deltas: BalanceDeltas): Promise<void> {
    const walletIds = [...deltas.entries()]
      .filter(([, cents]) => cents !== 0)
      .map(([walletId]) => walletId)
      .sort();
    if (walletIds.length === 0) return;

    const locked = await this.deps.wallets.lockMany(userId, walletIds, tx);
    if (locked.length !== walletIds.length) throw errors.notFound("Carteira");

    const now = this.deps.clock.now();
    for (const wallet of locked) {
      const next = wallet.balanceCents + (deltas.get(wallet.id) ?? 0);
      if (!Number.isSafeInteger(next)) {
        throw errors.unprocessable("BALANCE_OVERFLOW", "O saldo resultante excede o limite suportado.");
      }
      await this.deps.wallets.update(wallet.id, { balanceCents: next, updatedAt: now }, tx);
    }
  }
}
