import type { Goal, GoalStatus } from "@/data/api/types";
import { daysBetween } from "./dates";
import { formatMoney } from "./money";

/** Fração guardada para a barra de progresso (R16), limitada a 1: acima de 100% o texto mostra o valor real. */
export function progressFraction(saved: number | null, target: number): number {
  if (saved === null || target <= 0) return 0;
  return Math.min(1, Math.max(0, saved / target));
}

/** Rótulo do prazo (R15): "Faltam 12 dias", "Falta 1 dia", "Vence hoje" ou "Prazo encerrado". */
export function deadlineLabel(deadline: string, today: string): string {
  const days = daysBetween(today, deadline);
  if (days < 0) return "Prazo encerrado";
  if (days === 0) return "Vence hoje";
  return days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`;
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Em andamento",
  achieved: "Atingida",
  cancelled: "Cancelada",
};

/** "Falta R$ 300,00", "Meta atingida" ou null quando falta câmbio para somar as receitas. */
export function goalRemainingLabel(goal: Pick<Goal, "remaining" | "currency">): string | null {
  if (goal.remaining === null) return null;
  if (goal.remaining <= 0) return "Meta atingida";
  return `Falta ${formatMoney(goal.remaining, goal.currency)}`;
}

/** Percentual exibido (sem limite: 130% aparece como 130%). */
export function goalPercentLabel(percent: number | null): string | null {
  if (percent === null) return null;
  return `${Math.floor(percent)}%`;
}

/** Validação local da data limite (o servidor recusa datas passadas com INVALID_DEADLINE). */
export function deadlineError(deadline: string, today: string): string | null {
  if (!deadline) return "Escolha a data limite.";
  if (deadline < today) return "A data limite não pode estar no passado.";
  return null;
}
