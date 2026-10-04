export const WALLET_TYPES = ["checking", "savings", "cash", "investment", "credit_card", "other"] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

/** Carteira com valores já decifrados (em centavos) — como o repository entrega ao service. */
export interface Wallet {
  id: string;
  userId: string;
  name: string;
  type: WalletType;
  currency: string;
  isDefault: boolean;
  balanceCents: number;
  initialBalanceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewWallet = Wallet;

export interface WalletChanges {
  name?: string;
  type?: WalletType;
  currency?: string;
  isDefault?: boolean;
  balanceCents?: number;
  initialBalanceCents?: number;
  updatedAt: Date;
}

/** Variação de saldo por carteira, em centavos (positivo entra, negativo sai). */
export type BalanceDeltas = Map<string, number>;

export function addDelta(deltas: BalanceDeltas, walletId: string, cents: number): BalanceDeltas {
  deltas.set(walletId, (deltas.get(walletId) ?? 0) + cents);
  return deltas;
}
