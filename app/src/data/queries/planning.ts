import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CreateBudgetRequest, CreateGoalRequest, GoalStatus, UpdateGoalRequest } from "../api/types";
import { api } from "../client";
import { queryKeys } from "./keys";

/** Mudanças de planejamento afetam o status do mês, o histórico e os relatórios. */
function invalidatePlanning(queryClient: QueryClient) {
  return Promise.all(
    ["budgets", "reduction-goals", "goals", "reports", "notifications"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

// ---------- orçamentos (R21, R23, R45, R74) ----------

/** Status dos limites do mês e do dia: 1 requisição para a seção inteira (R83). */
export function useBudgetStatus(month: string, date?: string) {
  return useQuery({
    queryKey: queryKeys.budgetStatus(month, date),
    queryFn: () => api.budgets.status(month, date),
    placeholderData: keepPreviousData,
  });
}

export function useBudgetHistory(fromMonth: string, toMonth: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.budgetHistory(fromMonth, toMonth),
    queryFn: () => api.budgets.history(fromMonth, toMonth),
    enabled,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBudgetRequest) => api.budgets.create(body),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.budgets.update(id, amount),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.budgets.remove(id),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

// ---------- metas de redução (R67) ----------

export function useReductionGoals(month: string) {
  return useQuery({
    queryKey: queryKeys.reductionGoals(month),
    queryFn: () => api.reductionGoals.list(month).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReductionGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, percent }: { categoryId: string; percent: number }) =>
      api.reductionGoals.create(categoryId, percent),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useDeleteReductionGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reductionGoals.remove(id),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

// ---------- metas de economia (R15, R16, R17, R68) ----------

export function useGoals(status: GoalStatus | "all" = "active") {
  return useQuery({ queryKey: queryKeys.goals(status), queryFn: () => api.goals.list(status).then((r) => r.data) });
}

export function useGoal(id: string | null) {
  return useQuery({
    queryKey: queryKeys.goal(id ?? ""),
    queryFn: () => api.goals.get(id!),
    enabled: !!id,
  });
}

/** Metas para as quais a receita foi destinada (detalhes da transação). */
export function useTransactionContributions(transactionId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.goalContributions(transactionId ?? ""),
    queryFn: () => api.goals.byTransaction(transactionId!).then((r) => r.data),
    enabled: enabled && !!transactionId,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGoalRequest) => api.goals.create(body),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateGoalRequest }) => api.goals.update(id, body),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useCancelGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.goals.remove(id),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useContribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, transactionId, amount }: { goalId: string; transactionId: string; amount?: number }) =>
      api.goals.contribute(goalId, transactionId, amount),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}

export function useRemoveContribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, contributionId }: { goalId: string; contributionId: string }) =>
      api.goals.removeContribution(goalId, contributionId),
    onSuccess: () => invalidatePlanning(queryClient),
  });
}
