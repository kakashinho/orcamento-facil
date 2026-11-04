import type { Frequency, Reminder, Series } from "@/data/api/types";
import { daysBetween, formatDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { FREQUENCY_LABEL, seriesLabel } from "@/domain/series";

/** Textos de exibição de Planejamento › Contas (R37, R62, R34): só formatação, sem regra de negócio. */

const PER_PERIOD: Record<Frequency, string> = { weekly: "por semana", monthly: "por mês", yearly: "por ano" };

/** "Repete todo mês" (recorrência) ou "Parcela 3/10" (a última gerada do parcelamento). */
export function seriesKindLabel(
  series: Pick<Series, "kind" | "frequency" | "generatedCount" | "installments">,
): string {
  return seriesLabel({
    kind: series.kind,
    frequency: series.frequency,
    occurrence: series.generatedCount,
    total: series.installments,
  });
}

/** "R$ 50,00 por mês" (recorrência) ou "R$ 1.200,00 em 12×" (parcelamento). */
export function seriesAmountLabel(series: Series): string {
  const currency = series.wallet.currency;
  if (series.kind === "installment" && series.totalAmount !== null && series.installments !== null) {
    return `${formatMoney(series.totalAmount, currency)} em ${series.installments}×`;
  }
  return `${formatMoney(series.amount, currency)} ${PER_PERIOD[series.frequency]}`;
}

/** Próxima ocorrência, parcelas que faltam ou o motivo de a série não gerar mais nada. */
export function seriesScheduleLabel(series: Series): string {
  if (series.status === "cancelled") return "Cancelada";
  if (series.status === "ended" || !series.nextDate) return "Encerrada";
  const next = `Próxima: ${formatDate(series.nextDate)}`;
  if (series.kind === "installment" && series.remaining !== null) {
    return `${next} · ${series.remaining === 1 ? "falta 1" : `faltam ${series.remaining}`}`;
  }
  return series.endDate ? `${next} · até ${formatDate(series.endDate)}` : next;
}

/** "Vence hoje", "Vence amanhã", "Vence em 3 dias" ou "Venceu há 2 dias". */
export function dueLabel(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days > 1) return `Vence em ${days} dias`;
  return days === -1 ? "Venceu ontem" : `Venceu há ${-days} dias`;
}

/** Linha de apoio do lembrete: "Vence em 3 dias · Mensal · R$ 1.500,00". */
export function reminderSummary(reminder: Reminder, today: string): string {
  const parts = [dueLabel(reminder.nextDueDate, today), FREQUENCY_LABEL[reminder.frequency]];
  if (reminder.amount !== null) parts.push(formatMoney(reminder.amount, reminder.currency ?? "BRL"));
  return parts.join(" · ");
}

/** Recorrências de despesa ativas que podem virar lembrete (o servidor recusa as outras). */
export function canRemind(series: Series): boolean {
  return series.kind === "recurring" && series.type === "expense" && series.status === "active" && !!series.nextDate;
}
