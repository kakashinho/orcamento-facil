import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { wallets } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { NewWallet, Wallet, WalletChanges, WalletType } from "../types/wallet.types.js";

type WalletRow = typeof wallets.$inferSelect;

/** Saldo e saldo inicial ficam cifrados no banco (R81); aqui entram e saem em centavos. */
export class WalletRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toWallet(row: WalletRow): Wallet {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type as WalletType,
      currency: row.currency,
      isDefault: row.isDefault,
      balanceCents: this.cipher.decryptAmount(row.balance, aad.walletBalance(row.id)),
      initialBalanceCents: this.cipher.decryptAmount(row.initialBalance, aad.walletInitialBalance(row.id)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Carteira padrão primeiro, depois na ordem de criação. */
  async listByUser(userId: string): Promise<Wallet[]> {
    const rows = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(desc(wallets.isDefault), asc(wallets.createdAt), asc(wallets.id));
    return rows.map((row) => this.toWallet(row));
  }

  async findById(userId: string, walletId: string, tx?: DbTransaction): Promise<Wallet | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)));
    return row ? this.toWallet(row) : undefined;
  }

  async findByIdForUpdate(userId: string, walletId: string, tx: DbTransaction): Promise<Wallet | undefined> {
    const [row] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
      .for("update");
    return row ? this.toWallet(row) : undefined;
  }

  async findDefault(userId: string, tx?: DbTransaction): Promise<Wallet | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.isDefault, true)));
    return row ? this.toWallet(row) : undefined;
  }

  async findOldest(userId: string, tx: DbTransaction): Promise<Wallet | undefined> {
    const [row] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(asc(wallets.createdAt), asc(wallets.id))
      .limit(1);
    return row ? this.toWallet(row) : undefined;
  }

  /** Bloqueia as carteiras (FOR UPDATE) em ordem de id — evita deadlock entre operações concorrentes. */
  async lockMany(userId: string, walletIds: string[], tx: DbTransaction): Promise<Wallet[]> {
    if (walletIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), inArray(wallets.id, walletIds)))
      .orderBy(asc(wallets.id))
      .for("update");
    return rows.map((row) => this.toWallet(row));
  }

  async insert(wallet: NewWallet, tx?: DbTransaction): Promise<void> {
    try {
      await this.executor(tx)
        .insert(wallets)
        .values({
          id: wallet.id,
          userId: wallet.userId,
          name: wallet.name,
          type: wallet.type,
          currency: wallet.currency,
          isDefault: wallet.isDefault,
          initialBalance: this.cipher.encryptAmount(wallet.initialBalanceCents, aad.walletInitialBalance(wallet.id)),
          balance: this.cipher.encryptAmount(wallet.balanceCents, aad.walletBalance(wallet.id)),
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        });
    } catch (error) {
      if (isUniqueViolation(error, "wallets_user_name_uq")) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  async update(walletId: string, changes: WalletChanges, tx?: DbTransaction): Promise<void> {
    const { balanceCents, initialBalanceCents, ...plain } = changes;
    try {
      await this.executor(tx)
        .update(wallets)
        .set({
          ...plain,
          ...(balanceCents !== undefined
            ? { balance: this.cipher.encryptAmount(balanceCents, aad.walletBalance(walletId)) }
            : {}),
          ...(initialBalanceCents !== undefined
            ? { initialBalance: this.cipher.encryptAmount(initialBalanceCents, aad.walletInitialBalance(walletId)) }
            : {}),
        })
        .where(eq(wallets.id, walletId));
    } catch (error) {
      if (isUniqueViolation(error, "wallets_user_name_uq")) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  async clearDefault(userId: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx
      .update(wallets)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(wallets.userId, userId), eq(wallets.isDefault, true)));
  }

  async delete(walletId: string, tx: DbTransaction): Promise<void> {
    await tx.delete(wallets).where(eq(wallets.id, walletId));
  }
}
