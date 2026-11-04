import type { Frequency, TransactionSeriesInfo } from "@/data/api/types";
import { formatMoney } from "./money";

/**
 * Recorrências (R37) e parcelamentos (R62): rótulos, validação e a prévia da divisão das
 * parcelas, com a mesma regra do servidor (backend/src/modules/finance/services/series-rules.ts).
 */

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 72;

/** Texto de ajuda do formulário: nada entra no saldo antes da data (D-01). */
export const SERIES_HELP = "As próximas aparecem automaticamente na data de cada uma.";

/** Opções do "Repetir" no formulário e no "Marcar como recorrente". */
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

/** "Repete toda semana", "Repete todo mês", "Repete todo ano". */
export function repeatLabel(frequency: Frequency): string {
  if (frequency === "weekly") return "Repete toda semana";
  if (frequency === "monthly") return "Repete todo mês";
  return "Repete todo ano";
}

/** Rótulo da série nos detalhes e na lista: "Parcela 3/10" ou "Repete todo mês". */
export function seriesLabel(
  series: Pick<TransactionSeriesInfo, "kind" | "frequency" | "occurrence" | "total">,
): string {
  if (series.kind === "installment") return `Parcela ${series.occurrence}/${series.total ?? "?"}`;
  return repeatLabel(series.frequency);
}

/** Valor da parcela `index` (0 = a primeira), em centavos: a sobra da divisão fica na 1ª (D-11). */
export function installmentCents(totalCents: number, count: number, index: number): number {
  const base = Math.floor(totalCents / count);
  return index === 0 ? totalCents - base * (count - 1) : base;
}

export interface InstallmentsPreview {
  count: number;
  /** Valor da 1ª parcela (leva a sobra da divisão). */
  first: number;
  /** Valor de cada uma das demais. */
  others: number;
}

/** Divide o total em parcelas; null se a contagem for inválida ou o total não der 1 centavo por parcela. */
export function previewInstallments(total: number, count: number): InstallmentsPreview | null {
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) return null;
  const totalCents = Math.round(total * 100);
  if (!Number.isFinite(totalCents) || installmentCents(totalCents, count, count - 1) <= 0) return null;
  return {
    count,
    first: installmentCents(totalCents, count, 0) / 100,
    others: installmentCents(totalCents, count, 1) / 100,
  };
}

/** "3 × R$ 33,33 (1ª de R$ 33,34)" ou, sem sobra, "3 × R$ 40,00". */
export function formatInstallmentsPreview(preview: InstallmentsPreview, currency: string): string {
  const each = `${preview.count} × ${formatMoney(preview.others, currency)}`;
  return preview.first === preview.others ? each : `${each} (1ª de ${formatMoney(preview.first, currency)})`;
}

/** Número de parcelas digitado ("10") → inteiro, ou null se não for um número inteiro. */
export function parseInstallmentsInput(text: string): number | null {
  const cleaned = text.trim();
  return /^\d{1,3}$/.test(cleaned) ? Number(cleaned) : null;
}

/** Validação do parcelamento (2 a 72 parcelas, pelo menos 1 centavo em cada). */
export function validateInstallments(count: number | null, total: number | null): string | null {
  if (count === null || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    return `Use de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`;
  }
  if (total !== null && total > 0 && previewInstallments(total, count) === null) {
    return "O valor total é pequeno demais para esse número de parcelas.";
  }
  return null;
}

/** A data final (opcional) não pode ser antes da primeira ocorrência. */
export function validateEndDate(endDate: string, startDate: string): string | null {
  if (endDate && endDate < startDate) return "A data final deve ser igual ou posterior à primeira ocorrência.";
  return null;
}

/** Mensagens amigáveis para os erros de regra das rotas de série (409/422); null = usar a do servidor. */
export function seriesErrorMessage(code: string): string | null {
  switch (code) {
    case "TRANSACTION_TOO_OLD":
      return "Só é possível marcar como recorrente uma transação dos últimos 12 meses.";
    case "TRANSACTION_ALREADY_IN_SERIES":
      return "Esta transação já faz parte de uma recorrência ou parcelamento.";
    case "INVALID_END_DATE":
      return "A data final deve ser igual ou posterior à primeira ocorrência.";
    case "DATE_OUT_OF_RANGE":
      return "Use uma data entre 1 ano atrás e 1 ano à frente.";
    default:
      return null;
  }
}
