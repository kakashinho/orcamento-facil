import type { HttpClient } from "@/core/http/http-client";
import type {
  Budget,
  BudgetHistory,
  BudgetStatusReport,
  ContributionResult,
  CreateBudgetRequest,
  CreateGoalRequest,
  DataList,
  Goal,
  GoalDetail,
  GoalStatus,
  ReductionGoal,
  TransactionContribution,
  UpdateGoalRequest,
} from "./types";

/** Orçamentos mensais (R21) e diários (R74), status do mês (R45) e histórico (R23). */
export function budgetsApi(http: HttpClient) {
  return {
    list: (month?: string) => http.get<DataList<Budget>>("/api/budgets", { query: { month } }),
    status: (month?: string, date?: string) =>
      http.get<BudgetStatusReport>("/api/budgets/status", { query: { month, date } }),
    history: (fromMonth: string, toMonth: string) =>
      http.get<BudgetHistory>("/api/budgets/history", { query: { fromMonth, toMonth } }),
    create: (body: CreateBudgetRequest) => http.post<Budget>("/api/budgets", body),
    /** Novo limite vale a partir do mês atual; os meses anteriores guardam o antigo. */
    update: (id: string, amount: number) => http.patch<Budget>(`/api/budgets/${id}`, { amount }),
    remove: (id: string) => http.delete(`/api/budgets/${id}`),
  };
}

/** Metas de redução de gastos por categoria (R67). */
export function reductionGoalsApi(http: HttpClient) {
  return {
    list: (month?: string) => http.get<DataList<ReductionGoal>>("/api/reduction-goals", { query: { month } }),
    create: (categoryId: string, percent: number) =>
      http.post<ReductionGoal>("/api/reduction-goals", { categoryId, percent }),
    remove: (id: string) => http.delete(`/api/reduction-goals/${id}`),
  };
}

/** Metas de economia (R15), progresso (R16) e receitas destinadas a elas (R17). */
export function goalsApi(http: HttpClient) {
  return {
    list: (status: GoalStatus | "all" = "active") => http.get<DataList<Goal>>("/api/goals", { query: { status } }),
    get: (id: string) => http.get<GoalDetail>(`/api/goals/${id}`),
    create: (body: CreateGoalRequest) => http.post<Goal>("/api/goals", body),
    update: (id: string, body: UpdateGoalRequest) => http.patch<Goal>(`/api/goals/${id}`, body),
    /** Cancela a meta (as receitas continuam onde estão). */
    remove: (id: string) => http.delete(`/api/goals/${id}`),
    contribute: (goalId: string, transactionId: string, amount?: number) =>
      http.post<ContributionResult>(`/api/goals/${goalId}/contributions`, {
        transactionId,
        ...(amount !== undefined ? { amount } : {}),
      }),
    removeContribution: (goalId: string, contributionId: string) =>
      http.delete(`/api/goals/${goalId}/contributions/${contributionId}`),
    byTransaction: (transactionId: string) =>
      http.get<DataList<TransactionContribution>>("/api/goals/contributions", { query: { transactionId } }),
  };
}
