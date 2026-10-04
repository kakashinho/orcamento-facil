import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database, Executor } from "../../db/client.js";
import { actionHistory, transactions, transfers, users, wallets } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { errors } from "../../shared/errors.js";
import { fromCents, toCents } from "../../shared/money.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";
import type { ExchangeRateService } from "../exchange-rates/exchange-rate.service.js";

export type WalletRow = typeof wallets.$inferSelect;
export type WalletType = "checking" | "savings" | "cash" | "investment" | "credit_card" | "other";

export interface WalletDto {
  id: string;
  name: string;
  type: WalletType;
  currency: string;
  isDefault: boolean;
  balance: number;
  initialBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWalletInput {
  name: string;
  type?: WalletType | undefined;
  currency?: string | undefined;
  initialBalance?: number | undefined;
  isDefault?: boolean | undefined;
}

export type UpdateWalletInput = Partial<CreateWalletInput>;

export interface WalletSummary {
  primaryCurrency: string;
  totalBalance: number | null;
  ratesUpdatedAt: string | null;
  ratesStale: boolean;
  wallets: Array<WalletDto & { balanceInPrimaryCurrency: number | null }>;
}

const DEFAULT_WALLET_NAME = "Carteira";

export class WalletService {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  toDto(row: WalletRow): WalletDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type as WalletType,
      currency: row.currency,
      isDefault: row.isDefault,
      balance: fromCents(this.cipher.decryptAmount(row.balance, aad.walletBalance(row.id))),
      initialBalance: fromCents(this.cipher.decryptAmount(row.initialBalance, aad.walletInitialBalance(row.id))),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findOwned(executor: Executor, userId: string, walletId: string): Promise<WalletRow | undefined> {
    const [row] = await executor
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    return row;
  }

  async findDefault(executor: Executor, userId: string): Promise<WalletRow | undefined> {
    const [row] = await executor
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.isDefault, true)));
    return row;
  }

  async list(userId: string): Promise<WalletDto[]> {
    const rows = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(desc(wallets.isDefault), asc(wallets.createdAt), asc(wallets.id));
    return rows.map((row) => this.toDto(row));
  }

  async get(userId: string, walletId: string): Promise<WalletDto> {
    const row = await this.findOwned(this.db, userId, walletId);
    if (!row) throw errors.notFound("Carteira");
    return this.toDto(row);
  }

  /** Carteira inicial criada no cadastro, para que o usuário já possa registrar transações. */
  async createDefaultWallet(executor: Executor, userId: string, currency: string): Promise<void> {
    const id = randomUUID();
    const now = this.clock.now();
    await executor.insert(wallets).values({
      id,
      userId,
      name: DEFAULT_WALLET_NAME,
      type: "cash",
      currency,
      isDefault: true,
      initialBalance: this.cipher.encryptAmount(0, aad.walletInitialBalance(id)),
      balance: this.cipher.encryptAmount(0, aad.walletBalance(id)),
      createdAt: now,
      updatedAt: now,
    });
  }

  async create(userId: string, input: CreateWalletInput): Promise<WalletDto> {
    const [user] = await this.db
      .select({ primaryCurrency: users.primaryCurrency })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw errors.notFound("Usuário");

    const currency = input.currency ?? user.primaryCurrency;
    this.exchangeRates.assertCurrency(currency);
    const initialCents = toCents(input.initialBalance ?? 0, "initialBalance");
    const id = randomUUID();
    const now = this.clock.now();

    try {
      await this.db.transaction(async (tx) => {
        const currentDefault = await this.findDefault(tx, userId);
        const makeDefault = input.isDefault === true || !currentDefault;
        if (makeDefault && currentDefault) {
          await tx.update(wallets).set({ isDefault: false, updatedAt: now }).where(eq(wallets.id, currentDefault.id));
        }
        await tx.insert(wallets).values({
          id,
          userId,
          name: input.name.trim(),
          type: input.type ?? "other",
          currency,
          isDefault: makeDefault,
          initialBalance: this.cipher.encryptAmount(initialCents, aad.walletInitialBalance(id)),
          balance: this.cipher.encryptAmount(initialCents, aad.walletBalance(id)),
          createdAt: now,
          updatedAt: now,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, "wallets_user_name_uq")) {
        throw errors.conflict("WALLET_NAME_TAKEN", "Você já possui uma carteira com esse nome.");
      }
      throw error;
    }
    return this.get(userId, id);
  }

  private async countMovements(executor: Executor, walletId: string, onlyActive: boolean) {
    const [tx] = await executor
      .select({ value: count() })
      .from(transactions)
      .where(
        onlyActive
          ? and(eq(transactions.walletId, walletId), isNull(transactions.deletedAt))
          : eq(transactions.walletId, walletId),
      );
    const transferWallet = or(eq(transfers.sourceWalletId, walletId), eq(transfers.targetWalletId, walletId));
    const [tr] = await executor
      .select({ value: count() })
      .from(transfers)
      .where(onlyActive ? and(transferWallet, isNull(transfers.deletedAt)) : transferWallet);
    return { transactions: tx?.value ?? 0, transfers: tr?.value ?? 0 };
  }

  async update(userId: string, walletId: string, input: UpdateWalletInput): Promise<WalletDto> {
    const now = this.clock.now();
    try {
      await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
          .for("update");
        if (!row) throw errors.notFound("Carteira");

        const changes: Partial<typeof wallets.$inferInsert> = { updatedAt: now };
        if (input.name !== undefined) changes.name = input.name.trim();
        if (input.type !== undefined) changes.type = input.type;

        if (input.currency !== undefined && input.currency !== row.currency) {
          this.exchangeRates.assertCurrency(input.currency);
          const movements = await this.countMovements(tx, walletId, false);
          if (movements.transactions + movements.transfers > 0) {
            throw errors.conflict(
              "WALLET_HAS_MOVEMENTS",
              "Não é possível alterar a moeda de uma carteira que já possui movimentações.",
            );
          }
          changes.currency = input.currency;
        }

        if (input.initialBalance !== undefined) {
          const newInitial = toCents(input.initialBalance, "initialBalance");
          const oldInitial = this.cipher.decryptAmount(row.initialBalance, aad.walletInitialBalance(walletId));
          const balance = this.cipher.decryptAmount(row.balance, aad.walletBalance(walletId));
          changes.initialBalance = this.cipher.encryptAmount(newInitial, aad.walletInitialBalance(walletId));
          changes.balance = this.cipher.encryptAmount(balance + newInitial - oldInitial, aad.walletBalance(walletId));
        }

        if (input.isDefault === true && !row.isDefault) {
          await tx
            .update(wallets)
            .set({ isDefault: false, updatedAt: now })
            .where(and(eq(wallets.userId, userId), eq(wallets.isDefault, true)));
          changes.isDefault = true;
        } else if (input.isDefault === false && row.isDefault) {
          throw errors.conflict(
            "DEFAULT_WALLET_REQUIRED",
            "Defina outra carteira como padrão em vez de desmarcar a atual.",
          );
        }

        await tx.update(wallets).set(changes).where(eq(wallets.id, walletId));
      });
    } catch (error) {
      if (isUniqueViolation(error, "wallets_user_name_uq")) {
        throw errors.conflict("WALLET_NAME_TAKEN", "Você já possui uma carteira com esse nome.");
      }
      throw error;
    }
    return this.get(userId, walletId);
  }

  /**
   * Exclui uma carteira sem movimentações ativas. Transações e transferências já excluídas
   * (mantidas apenas para o "desfazer") são removidas definitivamente junto com seu histórico.
   */
  async delete(userId: string, walletId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
        .for("update");
      if (!row) throw errors.notFound("Carteira");

      const active = await this.countMovements(tx, walletId, true);
      if (active.transactions + active.transfers > 0) {
        throw errors.conflict(
          "WALLET_NOT_EMPTY",
          "A carteira possui movimentações. Exclua ou mova as transações e transferências antes de excluí-la.",
          active,
        );
      }

      const purgedTransactions = await tx
        .delete(transactions)
        .where(eq(transactions.walletId, walletId))
        .returning({ id: transactions.id });
      const purgedTransfers = await tx
        .delete(transfers)
        .where(or(eq(transfers.sourceWalletId, walletId), eq(transfers.targetWalletId, walletId)))
        .returning({ id: transfers.id });
      const purgedIds = [...purgedTransactions, ...purgedTransfers].map((item) => item.id);
      if (purgedIds.length > 0) {
        await tx
          .delete(actionHistory)
          .where(and(eq(actionHistory.userId, userId), inArray(actionHistory.entityId, purgedIds)));
      }

      await tx.delete(wallets).where(eq(wallets.id, walletId));

      if (row.isDefault) {
        const [next] = await tx
          .select({ id: wallets.id })
          .from(wallets)
          .where(eq(wallets.userId, userId))
          .orderBy(asc(wallets.createdAt), asc(wallets.id))
          .limit(1);
        if (next) {
          await tx.update(wallets).set({ isDefault: true, updatedAt: this.clock.now() }).where(eq(wallets.id, next.id));
        }
      }
    });
  }

  /** Saldos de todas as carteiras e total consolidado na moeda principal (R55, R28, R29). */
  async summary(userId: string): Promise<WalletSummary> {
    const [user] = await this.db
      .select({ primaryCurrency: users.primaryCurrency })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw errors.notFound("Usuário");

    const list = await this.list(userId);
    let total = 0;
    let complete = true;
    let ratesUpdatedAt: Date | null = null;
    let ratesStale = false;
    const items: WalletSummary["wallets"] = [];

    for (const wallet of list) {
      if (wallet.currency === user.primaryCurrency) {
        total += toCents(wallet.balance);
        items.push({ ...wallet, balanceInPrimaryCurrency: wallet.balance });
        continue;
      }
      try {
        const { cents, quote } = await this.exchangeRates.convert(
          toCents(wallet.balance),
          wallet.currency,
          user.primaryCurrency,
        );
        total += cents;
        ratesUpdatedAt = quote.updatedAt;
        ratesStale ||= quote.stale;
        items.push({ ...wallet, balanceInPrimaryCurrency: fromCents(cents) });
      } catch {
        complete = false;
        items.push({ ...wallet, balanceInPrimaryCurrency: null });
      }
    }

    return {
      primaryCurrency: user.primaryCurrency,
      totalBalance: complete ? fromCents(total) : null,
      ratesUpdatedAt: ratesUpdatedAt ? ratesUpdatedAt.toISOString() : null,
      ratesStale,
      wallets: items,
    };
  }
}
