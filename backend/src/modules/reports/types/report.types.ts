import type { StatementResponseDto } from "../schemas/report.schema.js";

export type MovementKind = "income" | "expense" | "transfer_in" | "transfer_out";

/** Extrato já calculado — o mesmo objeto é servido em JSON e renderizado em PDF. */
export type StatementReport = StatementResponseDto;

/** Movimento normalizado para os cálculos: transações e transferências no mesmo formato. */
export interface Movement {
  kind: MovementKind;
  referenceId: string;
  date: string;
  createdAt: Date;
  description: string;
  walletId: string;
  /** Efeito com sinal no saldo da carteira, em centavos. */
  cents: number;
  category: { id: string; name: string } | null;
}
