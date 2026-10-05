import type { HttpClient } from "@/core/http/http-client";
import type {
  Category,
  CategorySuggestion,
  Conversion,
  CreateCategoryRequest,
  CreateTransactionRequest,
  CreateTransferRequest,
  CreateWalletRequest,
  CurrencyList,
  DataList,
  ListTransactionsQuery,
  Page,
  ParsedTransaction,
  RateTable,
  Tag,
  Transaction,
  TransactionFilters,
  TransactionMonth,
  TransactionSummary,
  TransactionType,
  Transfer,
  UpdateTransactionRequest,
  UpdateWalletRequest,
  Wallet,
  WalletSummary,
} from "./types";

/** Carteiras (R53, R55, R56). */
export function walletsApi(http: HttpClient) {
  return {
    list: () => http.get<DataList<Wallet>>("/api/wallets"),
    summary: () => http.get<WalletSummary>("/api/wallets/summary"),
    create: (body: CreateWalletRequest) => http.post<Wallet>("/api/wallets", body),
    update: (id: string, body: UpdateWalletRequest) => http.patch<Wallet>(`/api/wallets/${id}`, body),
    remove: (id: string) => http.delete(`/api/wallets/${id}`),
  };
}

/** Categorias predefinidas (R07), personalizadas (R08) e sugestão por descrição (R44). */
export function categoriesApi(http: HttpClient) {
  return {
    list: (type?: TransactionType) => http.get<DataList<Category>>("/api/categories", { query: { type } }),
    create: (body: CreateCategoryRequest) => http.post<Category>("/api/categories", body),
    suggest: (description: string, type?: TransactionType) =>
      http.post<{ suggestions: CategorySuggestion[] }>("/api/categories/suggest", { description, type }),
    remove: (id: string) => http.delete(`/api/categories/${id}`),
  };
}

/** Tags (R43). */
export function tagsApi(http: HttpClient) {
  return {
    list: () => http.get<DataList<Tag>>("/api/tags"),
  };
}

/** Transações (R06, R09–R12, R26, R48, R52, R65, R70). */
export function transactionsApi(http: HttpClient) {
  return {
    list: (query: ListTransactionsQuery) => http.get<Page<Transaction>>("/api/transactions", { query: { ...query } }),
    summary: (filters: TransactionFilters) =>
      http.get<TransactionSummary>("/api/transactions/summary", { query: { ...filters } }),
    months: (walletId?: string) =>
      http.get<DataList<TransactionMonth>>("/api/transactions/months", { query: { walletId } }),
    get: (id: string) => http.get<Transaction>(`/api/transactions/${id}`),
    create: (body: CreateTransactionRequest) => http.post<Transaction>("/api/transactions", body),
    update: (id: string, body: UpdateTransactionRequest) => http.patch<Transaction>(`/api/transactions/${id}`, body),
    remove: (id: string) => http.delete(`/api/transactions/${id}`),
    duplicate: (id: string, overrides: Omit<UpdateTransactionRequest, "archived"> = {}) =>
      http.post<Transaction>(`/api/transactions/${id}/duplicate`, overrides),
    archive: (id: string) => http.post<Transaction>(`/api/transactions/${id}/archive`),
    unarchive: (id: string) => http.post<Transaction>(`/api/transactions/${id}/unarchive`),
    archiveBefore: (before: string) => http.post<{ archived: number }>("/api/transactions/archive", { before }),
    parse: (text: string) => http.post<ParsedTransaction>("/api/transactions/parse", { text }),
  };
}

/** Transferências entre carteiras (R54) com conversão de moeda (R29). */
export function transfersApi(http: HttpClient) {
  return {
    list: (query: { walletId?: string; limit?: number; cursor?: string } = {}) =>
      http.get<Page<Transfer>>("/api/transfers", { query }),
    /** `idempotencyKey` torna seguro repetir o envio (rede móvel instável). */
    create: (body: CreateTransferRequest, idempotencyKey: string) =>
      http.post<Transfer>("/api/transfers", body, { headers: { "Idempotency-Key": idempotencyKey } }),
    remove: (id: string) => http.delete(`/api/transfers/${id}`),
  };
}

/** Moedas (R28, R56) e câmbio atualizado pela ExchangeRate-API no servidor (R29). */
export function exchangeApi(http: HttpClient) {
  return {
    currencies: () => http.get<CurrencyList>("/api/currencies", { auth: false }),
    rates: (base: string, symbols?: string[]) =>
      http.get<RateTable>("/api/exchange-rates", { query: { base, symbols: symbols?.join(",") } }),
    convert: (from: string, to: string, amount: number) =>
      http.get<Conversion>("/api/exchange-rates/convert", { query: { from, to, amount } }),
  };
}
