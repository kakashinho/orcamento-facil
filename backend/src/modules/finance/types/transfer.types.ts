/** Transferência gravada, com valores decifrados em centavos. */
export interface TransferRecord {
  id: string;
  userId: string;
  sourceWalletId: string;
  targetWalletId: string;
  sourceCents: number;
  targetCents: number;
  /** Decimal exato em string; nulo quando as moedas são iguais. */
  exchangeRate: string | null;
  date: string;
  description: string | null;
  idempotencyKey: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

/** Leitura para a resposta da API, com nome e moeda das carteiras. */
export interface TransferDetails extends TransferRecord {
  sourceWallet: { id: string; name: string; currency: string };
  targetWallet: { id: string; name: string; currency: string };
}

export interface TransferFilters {
  walletId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface TransferCursor {
  date: string;
  createdAt: string;
  id: string;
}
