import type { HttpClient, Query } from "@/core/http/http-client";
import type {
  CashFlow,
  DataList,
  HistoryEntry,
  MaintenanceState,
  MonthlyReport,
  Overview,
  PeriodQuery,
  Statement,
  SystemStatus,
  UndoResult,
} from "./types";

/** Relatórios: tela inicial (R55, R83), extrato e PDF (R41), fluxo de caixa (R58), gráficos (R01). */
export function reportsApi(http: HttpClient) {
  return {
    overview: (month?: string) => http.get<Overview>("/api/reports/overview", { query: { month } }),
    statement: (query: PeriodQuery) => http.get<Statement>("/api/reports/statement", { query: { ...query } }),
    /** URL do PDF do extrato; o download é feito pelo sistema de arquivos com o cabeçalho de autorização. */
    statementPdfUrl: (query: PeriodQuery) => http.url("/api/reports/statement/pdf", { ...query } as Query),
    cashFlow: (query: PeriodQuery) => http.get<CashFlow>("/api/reports/cash-flow", { query: { ...query } }),
    monthly: (fromMonth: string, toMonth: string) =>
      http.get<MonthlyReport>("/api/reports/monthly", { query: { fromMonth, toMonth } }),
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
