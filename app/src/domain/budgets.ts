import type { BudgetState, BudgetStatus, ReductionGoal } from "@/data/api/types";
import type { ColorScheme, Palette } from "@/ui";
import { formatMoney } from "./money";

/** A partir deste percentual do limite o orçamento entra em atenção (mesmo limiar do backend). */
export const BUDGET_WARNING_PERCENT = 80;

/**
 * Estado do orçamento pelo gasto (R21, R74), com os limiares do backend: `warning` a partir de 80% do
 * limite e `exceeded` quando passa do limite (100% exatos ainda é atenção).
 */
export function budgetState(spent: number, limit: number): BudgetState {
  if (spent > limit) return "exceeded";
  if (spent * 100 >= limit * BUDGET_WARNING_PERCENT) return "warning";
  return "ok";
}

/** Fração para a barra de progresso, limitada a 1 (o valor real aparece no texto). */
export function budgetFraction(spent: number | null, limit: number): number {
  if (spent === null || limit <= 0) return 0;
  return Math.min(1, Math.max(0, spent / limit));
}

/** Âmbar legível nos dois temas (a paleta Material não tem cor de "atenção"). */
const WARNING_COLORS: Record<ColorScheme, string> = { light: "#B86E00", dark: "#FFB95C" };

/** Cor do estado: token da paleta (`primary`, `error`) ou cor literal; resolva com `resolveColor`. */
export function budgetStateColor(state: BudgetState, scheme: ColorScheme = "light"): keyof Palette | string {
  if (state === "exceeded") return "error";
  if (state === "warning") return WARNING_COLORS[scheme];
  return "primary";
}

export const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  ok: "Dentro do limite",
  warning: "Atenção",
  exceeded: "Estourado",
};

/** "Restam R$ 40,00", "Limite atingido" ou "R$ 12,00 acima" (null quando falta câmbio). */
export function remainingLabel(item: Pick<BudgetStatus, "remaining" | "currency">): string | null {
  if (item.remaining === null) return null;
  if (item.remaining > 0) return `Restam ${formatMoney(item.remaining, item.currency)}`;
  if (item.remaining === 0) return "Limite atingido";
  return `${formatMoney(-item.remaining, item.currency)} acima`;
}

/** "42%" (uma casa abaixo de 10%), a partir do percentual do servidor. */
export function percentLabel(percent: number | null): string | null {
  if (percent === null) return null;
  const rounded = Math.abs(percent) < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
  return `${String(rounded).replace(".", ",")}%`;
}

/** Resumo para o leitor de tela do gráfico orçado × gasto (R45). */
export function describeBudget(item: Pick<BudgetStatus, "category" | "spent" | "limit" | "currency">): string {
  const limit = formatMoney(item.limit, item.currency);
  if (item.spent === null) return `${item.category.name}: limite de ${limit}, gasto indisponível`;
  return `${item.category.name}: gasto ${formatMoney(item.spent, item.currency)} de ${limit}`;
}

/** Diferença de gasto entre dois meses na comparação do histórico (R23): "R$ 120,00 a menos". */
export function spentDifferenceLabel(before: number | null, after: number | null, currency: string): string | null {
  if (before === null || after === null) return null;
  const difference = Math.round((after - before) * 100) / 100;
  if (difference === 0) return "Mesmo gasto";
  return `${formatMoney(Math.abs(difference), currency)} a ${difference > 0 ? "mais" : "menos"}`;
}

/** Percentuais rápidos e limites aceitos pelo backend nas metas de redução (R67). */
export const REDUCTION_PRESETS = [5, 10, 20] as const;
export const REDUCTION_MIN = 1;
export const REDUCTION_MAX = 90;

/** Percentual digitado (inteiro de 1 a 90) ou null se inválido. */
export function parseReductionPercent(text: string): number | null {
  const trimmed = text.trim().replace("%", "");
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= REDUCTION_MIN && value <= REDUCTION_MAX ? value : null;
}

export const REDUCTION_STATE_LABEL: Record<ReductionGoal["state"], string> = {
  on_track: "Dentro da meta",
  exceeded: "Acima da meta",
};
