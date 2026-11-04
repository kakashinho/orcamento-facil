import { addDays } from "../../../shared/utils/dates.js";
import type { SeriesFrequency, SeriesRecord } from "../types/series.types.js";

/**
 * Regras puras das séries, sem banco: calendário das ocorrências e divisão das
 * parcelas. O app usa a mesma divisão para a prévia (domain/series.ts).
 */

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Data da ocorrência `index` (0 = a primeira). Mensal e anual mantêm o dia original (`anchorDay`)
 * e caem no último dia dos meses mais curtos: 31/01 → 28/02 → 31/03; 29/02 → 28/02.
 */
export function occurrenceDate(startDate: string, anchorDay: number, frequency: SeriesFrequency, index: number): string {
  if (frequency === "weekly") return addDays(startDate, 7 * index);
  const [year, month] = startDate.split("-").map(Number) as [number, number];
  const monthIndex = month - 1 + (frequency === "monthly" ? index : 12 * index);
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(anchorDay, lastDay))}`;
}

/** Valor da parcela `index` (0 = a primeira), em centavos: a sobra da divisão fica na 1ª. */
export function installmentCents(totalCents: number, count: number, index: number): number {
  const base = Math.floor(totalCents / count);
  return index === 0 ? totalCents - base * (count - 1) : base;
}

/** Valor da ocorrência `index` da série. */
export function occurrenceAmount(series: Pick<SeriesRecord, "kind" | "amountCents" | "installments">, index: number): number {
  return series.kind === "installment" ? installmentCents(series.amountCents, series.installments!, index) : series.amountCents;
}

/**
 * Estado da série depois de gerar a ocorrência de número `generatedCount` (1, 2, …): a próxima
 * data, ou o fim quando acabaram as parcelas ou passou da data final.
 */
export function advance(
  series: Pick<SeriesRecord, "kind" | "frequency" | "startDate" | "anchorDay" | "endDate" | "installments">,
  generatedCount: number,
): { nextDate: string | null; status: "active" | "ended" } {
  if (series.kind === "installment" && generatedCount >= series.installments!) return { nextDate: null, status: "ended" };
  const next = occurrenceDate(series.startDate, series.anchorDay, series.frequency, generatedCount);
  if (series.endDate !== null && next > series.endDate) return { nextDate: null, status: "ended" };
  return { nextDate: next, status: "active" };
}
