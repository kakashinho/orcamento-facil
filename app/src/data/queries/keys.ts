import type { QueryClient } from "@tanstack/react-query";
import type { ListTransactionsQuery, PeriodQuery, TransactionFilters, TransactionType } from "../api/types";

/** Chaves do cache do React Query, centralizadas para invalidar com precisão. */
export const queryKeys = {
  overview: (month?: string) => ["overview", month ?? "current"] as const,
  walletSummary: ["wallets", "summary"] as const,
  categories: (type?: TransactionType) => ["categories", type ?? "all"] as const,
  categorySuggestion: (description: string, type: TransactionType) =>
    ["categories", "suggest", type, description] as const,
  tags: ["tags"] as const,
  transactions: (query: Omit<ListTransactionsQuery, "cursor">) => ["transactions", "list", query] as const,
  transactionSummary: (filters: TransactionFilters) => ["transactions", "summary", filters] as const,
  transfers: ["transfers"] as const,
  currencies: ["currencies"] as const,
  rates: (base: string) => ["rates", base] as const,
  conversion: (from: string, to: string, amount: number) => ["conversion", from, to, amount] as const,
  statement: (query: PeriodQuery) => ["reports", "statement", query] as const,
  cashFlow: (query: PeriodQuery) => ["reports", "cash-flow", query] as const,
  monthly: (fromMonth: string, toMonth: string) => ["reports", "monthly", fromMonth, toMonth] as const,
  systemStatus: ["system", "status"] as const,
  biometricCredentials: ["biometric", "credentials"] as const,
};

/** Depois de qualquer alteração financeira: saldos, listas e relatórios ficam desatualizados. */
export function invalidateFinance(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    ["overview", "wallets", "transactions", "transfers", "reports", "tags"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  ).then(() => undefined);
}
