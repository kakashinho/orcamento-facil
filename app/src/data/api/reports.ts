import type { HttpClient, Query } from "@/core/http/http-client";
import type {
  BalanceEvolution,
  BalanceEvolutionQuery,
  ByCategoryQuery,
  ByCategoryReport,
  CashFlow,
  DataList,
  HistoryEntry,
  MaintenanceState,
  MonthIndicators,
  MonthlyReport,
  Overview,
  PeriodQuery,
  Projection,
  Statement,
  SystemStatus,
  UndoResult,
} from "./types";

/**
 * Relatórios: tela inicial (R55, R83), extrato e PDF (R41), fluxo de caixa (R58), gráficos (R01),
 * evolução do saldo (R14), indicadores do mês (R35, R36, R75) e projeção (R63).
 */
export function reportsApi(http: HttpClient) {
  return {
    overview: (month?: string) => http.get<Overview>("/api/reports/overview", { query: { month } }),
    statement: (query: PeriodQuery) => http.get<Statement>("/api/reports/statement", { query: { ...query } }),
    /** URL do PDF do extrato; o download é feito pelo sistema de arquivos com o cabeçalho de autorização. */
    statementPdfUrl: (query: PeriodQuery) => http.url("/api/reports/statement/pdf", { ...query } as Query),
    cashFlow: (query: PeriodQuery) => http.get<CashFlow>("/api/reports/cash-flow", { query: { ...query } }),
    monthly: (fromMonth: string, toMonth: string) =>
      http.get<MonthlyReport>("/api/reports/monthly", { query: { fromMonth, toMonth } }),
    /** Despesas (ou receitas) por categoria (R13, R50); as ocultas (R46) só com `includeHidden`. */
    byCategory: ({ includeHidden, ...query }: ByCategoryQuery) =>
      http.get<ByCategoryReport>("/api/reports/by-category", {
        query: { ...query, includeHidden: includeHidden ? "true" : undefined },
      }),
    balanceEvolution: (query: BalanceEvolutionQuery) =>
      http.get<BalanceEvolution>("/api/reports/balance-evolution", { query: { ...query } }),
    monthIndicators: (month?: string) =>
      http.get<MonthIndicators>("/api/reports/month-indicators", { query: { month } }),
    projection: (months = 6) => http.get<Projection>("/api/reports/projection", { query: { months } }),
  };
}

/** Histórico de ações e desfazer (R49). */
export function historyApi(http: HttpClient) {
  return {
    list: (limit = 20) => http.get<DataList<HistoryEntry>>("/api/history", { query: { limit } }),
    undo: () => http.post<UndoResult>("/api/history/undo"),
  };
}

/** Status público e modo de manutenção (R72). */
export function systemApi(http: HttpClient) {
  return {
    status: () => http.get<SystemStatus>("/api/system/status", { auth: false }),
    setMaintenance: (enabled: boolean, message?: string | null) =>
      http.put<MaintenanceState>("/api/admin/maintenance", { enabled, ...(message !== undefined ? { message } : {}) }),
  };
}
