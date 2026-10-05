import type { CashFlowEntry } from "@/data/api/types";
import { toPrimaryCurrency } from "@/domain/money";

export type CashFlowKindFilter = "all" | "in" | "out";

export interface CashFlowRow {
  entry: CashFlowEntry;
  /** Saldo acumulado na moeda principal (null se faltar cotação de alguma moeda). */
  running: number | null;
  isTransfer: boolean;
}

/**
 * Linhas do fluxo de caixa (R58) em ordem cronológica, com saldo acumulado na moeda principal.
 * Transferências aparecem (quando há carteira filtrada), mas também movem o saldo da carteira.
 */
export function buildCashFlowRows(
  entries: CashFlowEntry[],
  primary: string,
  rates: Record<string, number> | undefined,
  kind: CashFlowKindFilter = "all",
): CashFlowRow[] {
  let running: number | null = 0;
  const rows: CashFlowRow[] = [];
  for (const entry of entries) {
    const converted = toPrimaryCurrency(entry.amount, entry.wallet.currency, primary, rates);
    running = running === null || converted === null ? null : running + converted;
    const isIn = entry.amount >= 0;
    if (kind === "in" && !isIn) continue;
    if (kind === "out" && isIn) continue;
    rows.push({ entry, running, isTransfer: entry.kind === "transfer_in" || entry.kind === "transfer_out" });
  }
  return rows;
}
