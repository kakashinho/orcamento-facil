import type { HttpClient } from "@/core/http/http-client";
import { authApi, biometricApi, usersApi } from "./auth";
import { categoriesApi, exchangeApi, tagsApi, transactionsApi, transfersApi, walletsApi } from "./finance";
import { historyApi, reportsApi, systemApi } from "./reports";

export * from "./types";

/** Agrupa todos os recursos da API sobre um cliente HTTP. */
export function createApi(http: HttpClient) {
  return {
    auth: authApi(http),
    users: usersApi(http),
    biometric: biometricApi(http),
    wallets: walletsApi(http),
    categories: categoriesApi(http),
    tags: tagsApi(http),
    transactions: transactionsApi(http),
    transfers: transfersApi(http),
    exchange: exchangeApi(http),
    reports: reportsApi(http),
    history: historyApi(http),
    system: systemApi(http),
  };
}

export type Api = ReturnType<typeof createApi>;
