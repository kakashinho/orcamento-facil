import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { BalanceEvolutionQuery, ByCategoryQuery, PeriodQuery } from "../api/types";
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
export function useMonthlyReport(fromMonth: string, toMonth: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.monthly(fromMonth, toMonth),
    queryFn: () => api.reports.monthly(fromMonth, toMonth),
    enabled,
  });
}

/** Totais por categoria do período (R13, R50), sem as ocultas (R46). */
export function useByCategory(query: ByCategoryQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.byCategory(query),
    queryFn: () => api.reports.byCategory(query),
    enabled: enabled && !!query.from && !!query.to,
    placeholderData: keepPreviousData,
  });
}

/** Evolução do saldo por dia ou por mês (R14). */
export function useBalanceEvolution(query: BalanceEvolutionQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.balanceEvolution(query),
    queryFn: () => api.reports.balanceEvolution(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Saldo médio diário (R35), economia (R75) e maiores despesas (R36) do mês. */
export function useMonthIndicators(month: string) {
  return useQuery({
    queryKey: queryKeys.monthIndicators(month),
    queryFn: () => api.reports.monthIndicators(month),
    placeholderData: keepPreviousData,
  });
}

/** Saldo projetado pelos lançamentos fixos (R63); só consulta quando o cartão aparece. */
export function useProjection(months: number, enabled = true) {
  return useQuery({ queryKey: queryKeys.projection(months), queryFn: () => api.reports.projection(months), enabled });
}
