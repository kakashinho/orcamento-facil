import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import type {
  CreateCategoryRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  CreateWalletRequest,
  ListTransactionsQuery,
  TransactionFilters,
  TransactionType,
  UpdateTransactionRequest,
  UpdateWalletRequest,
} from "../api/types";
import { api } from "../client";
import { invalidateFinance, queryKeys } from "./keys";

/** Tamanho da página da lista (R09): pequeno para economizar dados (R86) e abrir rápido (R83). */
export const TRANSACTIONS_PAGE_SIZE = 20;

// ---------- carteiras (R53, R55, R56) ----------

export function useWalletSummary() {
  return useQuery({ queryKey: queryKeys.walletSummary, queryFn: () => api.wallets.summary() });
}

export function useCreateWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWalletRequest) => api.wallets.create(body),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useUpdateWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWalletRequest }) => api.wallets.update(id, body),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useDeleteWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.wallets.remove(id),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

// ---------- categorias e tags (R07, R08, R43, R44) ----------

export function useCategories(type?: TransactionType) {
  return useQuery({
    queryKey: queryKeys.categories(type),
    queryFn: () => api.categories.list(type).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => api.categories.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

/** Sugestão de categoria pela descrição (R44); só consulta com 3+ letras. */
export function useCategorySuggestion(description: string, type: TransactionType, enabled: boolean) {
  const text = description.trim();
  return useQuery({
    queryKey: queryKeys.categorySuggestion(text.toLowerCase(), type),
    queryFn: () => api.categories.suggest(text, type).then((r) => r.suggestions[0] ?? null),
    enabled: enabled && text.length >= 3,
    staleTime: 10 * 60_000,
  });
}

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => api.tags.list().then((r) => r.data) });
}

// ---------- transações ----------

/** Lista com rolagem infinita por cursor (R09) e filtros/ordenação no servidor (R10, R26, R52, R70). */
export function useTransactionsInfinite(query: Omit<ListTransactionsQuery, "cursor" | "limit">) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: ({ pageParam }) =>
      api.transactions.list({ ...query, limit: TRANSACTIONS_PAGE_SIZE, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useTransactionSummary(filters: TransactionFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.transactionSummary(filters),
    queryFn: () => api.transactions.summary(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTransactionRequest) => api.transactions.create(body),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionRequest }) => api.transactions.update(id, body),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.transactions.remove(id),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useDuplicateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.transactions.duplicate(id),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useSetArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? api.transactions.archive(id) : api.transactions.unarchive(id),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useArchiveBefore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (before: string) => api.transactions.archiveBefore(before),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

/** Frase reconhecida pela voz → rascunho de transação (R65). Nada é gravado. */
export function useParseTransactionText() {
  return useMutation({ mutationFn: (text: string) => api.transactions.parse(text) });
}

// ---------- transferências (R54) ----------

export function useTransfers() {
  return useQuery({ queryKey: queryKeys.transfers, queryFn: () => api.transfers.list({ limit: 10 }) });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    // Uma chave por tentativa do usuário: se a rede cair e o app repetir, o servidor não duplica.
    mutationFn: ({ body, idempotencyKey }: { body: CreateTransferRequest; idempotencyKey?: string }) =>
      api.transfers.create(body, idempotencyKey ?? randomUUID()),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

export function useDeleteTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.transfers.remove(id),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

// ---------- desfazer (R49) ----------

export function useUndo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.history.undo(),
    onSuccess: () => invalidateFinance(queryClient),
  });
}

// ---------- moedas e câmbio (R28, R29, R56) ----------

export function useCurrencies() {
  return useQuery({
    queryKey: queryKeys.currencies,
    queryFn: () => api.exchange.currencies(),
    staleTime: 6 * 60 * 60_000,
  });
}

export function useRates(base: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rates(base),
    queryFn: () => api.exchange.rates(base),
    enabled: enabled && !!base,
    staleTime: 30 * 60_000,
  });
}

export function useConversion(from: string, to: string, amount: number) {
  return useQuery({
    queryKey: queryKeys.conversion(from, to, amount),
    queryFn: () => api.exchange.convert(from, to, amount),
    enabled: !!from && !!to && from !== to && amount > 0,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}
