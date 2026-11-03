import type { MonthlyReport } from "@/data/api/types";

export interface AnnualMonth {
  month: string;
  income: number | null;
  expense: number | null;
  net: number | null;
  /** Mês que ainda não chegou: barra vazia e esmaecida. */
  future: boolean;
}

export interface AnnualSummary {
  months: AnnualMonth[];
  totals: { income: number; expense: number; net: number; averageIncome: number; averageExpense: number };
  /** Meses decorridos com dados (base das médias). */
  monthsCounted: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Resumo anual (R38): os 12 meses do ano com receitas, despesas e saldo convertidos, e os totais e
 * médias mensais sobre os meses já decorridos que têm dados (os sem cotação ficam de fora).
 */
export function summarizeYear(report: MonthlyReport["months"], year: number, currentMonth: string): AnnualSummary {
  const byMonth = new Map(report.map((item) => [item.month, item]));
  const months: AnnualMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const converted = byMonth.get(month)?.converted ?? null;
    const future = month > currentMonth;
    return {
      month,
      income: future ? null : (converted?.income ?? null),
      expense: future ? null : (converted?.expense ?? null),
      net: future ? null : (converted?.net ?? null),
      future,
    };
  });
  const counted = months.filter((m) => !m.future && m.income !== null && m.expense !== null);
  const income = counted.reduce((sum, m) => sum + (m.income ?? 0), 0);
  const expense = counted.reduce((sum, m) => sum + (m.expense ?? 0), 0);
  const n = counted.length;
  return {
    months,
    totals: {
      income: round(income),
      expense: round(expense),
      net: round(income - expense),
      averageIncome: n ? round(income / n) : 0,
      averageExpense: n ? round(expense / n) : 0,
    },
    monthsCounted: n,
  };
}
