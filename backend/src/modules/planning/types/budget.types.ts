export const BUDGET_PERIODS = ["monthly", "daily"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

/** Orçamento com o valor já decifrado (centavos), como o repository entrega ao service. */
export interface BudgetRecord {
  id: string;
  userId: string;
  categoryId: string;
  period: BudgetPeriod;
  amountCents: number;
  currency: string;
  /** Mês "AAAA-MM" em que passa a valer. */
  validFrom: string;
  /** Último mês de vigência; null = em vigor. */
  validTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Situação do gasto em relação ao limite (R21, R22, R45). */
export type BudgetState = "ok" | "warning" | "exceeded";

/** A partir deste percentual o orçamento fica "em atenção" (D-31). */
export const BUDGET_WARNING_PERCENT = 80;

/** `exceeded` quando passa do limite; `warning` a partir de 80% do limite. */
export function budgetState(spentCents: number, limitCents: number): BudgetState {
  if (spentCents > limitCents) return "exceeded";
  if (spentCents * 100 >= limitCents * BUDGET_WARNING_PERCENT) return "warning";
  return "ok";
}
