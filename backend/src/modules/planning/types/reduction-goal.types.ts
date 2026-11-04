/** Meta de redução (R67) com a base já decifrada, em centavos. */
export interface ReductionGoalRecord {
  id: string;
  userId: string;
  categoryId: string;
  /** Redução desejada, de 1% a 90%. */
  percent: number;
  /** Média mensal de gasto da categoria nos meses anteriores ao início; congelada na criação. */
  baselineCents: number;
  currency: string;
  baselineMonths: number;
  startMonth: string;
  endMonth: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Meses anteriores usados na base. */
export const REDUCTION_BASELINE_MONTHS = 3;

/** Alvo do mês: base × (100 − percentual) / 100, em centavos. */
export function reductionTarget(baselineCents: number, percent: number): number {
  return Math.round((baselineCents * (100 - percent)) / 100);
}
