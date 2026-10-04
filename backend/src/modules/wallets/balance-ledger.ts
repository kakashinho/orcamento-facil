import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbTransaction } from "../../db/client.js";
import { wallets } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { errors } from "../../shared/errors.js";

/** Efeito de um movimento no saldo: carteira e variação em centavos. */
export type BalanceDeltas = Map<string, number>;

export function addDelta(deltas: BalanceDeltas, walletId: string, cents: number): BalanceDeltas {
  deltas.set(walletId, (deltas.get(walletId) ?? 0) + cents);
  return deltas;
}

/**
 * Aplica variações aos saldos materializados e cifrados (R55) dentro da transação de banco
 * do movimento. As carteiras são bloqueadas (FOR UPDATE) em ordem de id, evitando deadlock
 * entre operações concorrentes sobre as mesmas carteiras.
 */
export class BalanceLedger {
  constructor(
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
  ) {}

  async apply(tx: DbTransaction, userId: string, deltas: BalanceDeltas): Promise<void> {
    const walletIds = [...deltas.entries()]
      .filter(([, cents]) => cents !== 0)
      .map(([walletId]) => walletId)
      .sort();
    if (walletIds.length === 0) return;

    const rows = await tx
      .select({ id: wallets.id, balance: wallets.balance })
      .from(wallets)
      .where(and(eq(wallets.userId, userId), inArray(wallets.id, walletIds)))
      .orderBy(asc(wallets.id))
      .for("update");
    if (rows.length !== walletIds.length) {
      throw errors.notFound("Carteira");
    }

    const now = this.clock.now();
    for (const row of rows) {
      const current = this.cipher.decryptAmount(row.balance, aad.walletBalance(row.id));
      const next = current + (deltas.get(row.id) ?? 0);
      if (!Number.isSafeInteger(next)) {
        throw errors.unprocessable("BALANCE_OVERFLOW", "O saldo resultante excede o limite suportado.");
      }
      await tx
        .update(wallets)
        .set({ balance: this.cipher.encryptAmount(next, aad.walletBalance(row.id)), updatedAt: now })
        .where(eq(wallets.id, row.id));
    }
  }
}
