import type { QueryClient } from "@tanstack/react-query";
import type {
  BalanceEvolutionQuery,
  ByCategoryQuery,
  GoalStatus,
  ListTransactionsQuery,
  PeriodQuery,
  SeriesStatus,
  TransactionFilters,
  TransactionType,
} from "../api/types";

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
  byCategory: (query: ByCategoryQuery) => ["reports", "by-category", query] as const,
  balanceEvolution: (query: BalanceEvolutionQuery) => ["reports", "balance-evolution", query] as const,
  monthIndicators: (month: string) => ["reports", "month-indicators", month] as const,
  projection: (months: number) => ["reports", "projection", months] as const,
  budgetStatus: (month: string, date?: string) => ["budgets", "status", month, date ?? "today"] as const,
  budgetHistory: (fromMonth: string, toMonth: string) => ["budgets", "history", fromMonth, toMonth] as const,
  reductionGoals: (month: string) => ["reduction-goals", month] as const,
  goals: (status: GoalStatus | "all") => ["goals", "list", status] as const,
  goal: (id: string) => ["goals", "detail", id] as const,
  goalContributions: (transactionId: string) => ["goals", "contributions", transactionId] as const,
  series: (status: SeriesStatus | "all") => ["series", "list", status] as const,
  seriesItem: (id: string) => ["series", "detail", id] as const,
  notifications: (unread: boolean) => ["notifications", "list", unread] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  notificationSettings: ["notification-settings"] as const,
  reminders: ["reminders"] as const,
  attachments: (transactionId: string) => ["attachments", transactionId] as const,
  systemStatus: ["system", "status"] as const,
  biometricCredentials: ["biometric", "credentials"] as const,
};

/**
 * Depois de qualquer alteração financeira: saldos, listas e relatórios ficam desatualizados, e também
 * o status dos orçamentos, o progresso das metas, as séries e os avisos gerados no servidor.
 */
export function invalidateFinance(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    [
      "overview",
      "wallets",
      "transactions",
      "transfers",
      "reports",
      "tags",
      "budgets",
      "reduction-goals",
      "goals",
      "series",
      "notifications",
    ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  ).then(() => {
    // Os avisos nascem no servidor logo depois da resposta (eventos de domínio): consulta de novo em 2 s.
    setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["notifications"] }), NOTIFICATIONS_DELAY_MS);
  });
}

export const NOTIFICATIONS_DELAY_MS = 2_000;
