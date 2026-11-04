import type { TransactionType } from "./transaction.types.js";

export const SERIES_KINDS = ["recurring", "installment"] as const;
export type SeriesKind = (typeof SERIES_KINDS)[number];
export const SERIES_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];
export const SERIES_STATUSES = ["active", "ended", "cancelled"] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

/** Plano de uma recorrência (R37) ou parcelamento (R62), com o valor decifrado (centavos). */
export interface SeriesRecord {
  id: string;
  userId: string;
  kind: SeriesKind;
  type: TransactionType;
  frequency: SeriesFrequency;
  walletId: string;
  categoryId: string | null;
  description: string;
  tagIds: string[];
  /** Recorrência: valor de cada ocorrência. Parcelamento: valor total. */
  amountCents: number;
  installments: number | null;
  startDate: string;
  anchorDay: number;
  endDate: string | null;
  /** Próxima ocorrência a gerar; null quando encerrada ou cancelada. */
  nextDate: string | null;
  generatedCount: number;
  status: SeriesStatus;
  /** Chave de idempotência da criação (null = sem chave, ex.: marcada a partir de uma transação). */
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SeriesChanges = Partial<
  Pick<SeriesRecord, "walletId" | "categoryId" | "description" | "amountCents" | "endDate" | "nextDate" | "generatedCount" | "status">
> & { updatedAt: Date };

/** Ocorrência ainda não gerada (projeção — R63). */
export interface PlannedOccurrence {
  seriesId: string;
  description: string;
  kind: SeriesKind;
  type: TransactionType;
  date: string;
  amountCents: number;
  walletId: string;
}
