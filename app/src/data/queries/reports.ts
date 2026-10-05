import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PeriodQuery } from "../api/types";
import { api } from "../client";
import { queryKeys } from "./keys";

/** Tela inicial em uma única requisição (R55, R83, R86). */
export function useOverview(month?: string) {
  return useQuery({ queryKey: queryKeys.overview(month), queryFn: () => api.reports.overview(month) });
}

/** Extrato do período (R41). */
export function useStatement(query: PeriodQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.statement(query),
    queryFn: () => api.reports.statement(query),
    enabled: enabled && !!query.from && !!query.to,
    placeholderData: keepPreviousData,
  });
}

/** Fluxo de caixa do período (R58). */
export function useCashFlow(query: PeriodQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cashFlow(query),
    queryFn: () => api.reports.cashFlow(query),
    enabled: enabled && !!query.from && !!query.to,
    placeholderData: keepPreviousData,
  });
}

/** Receitas e despesas por mês (gráfico de evolução — R01). */
export function useMonthlyReport(fromMonth: string, toMonth: string) {
  return useQuery({
    queryKey: queryKeys.monthly(fromMonth, toMonth),
    queryFn: () => api.reports.monthly(fromMonth, toMonth),
  });
}
