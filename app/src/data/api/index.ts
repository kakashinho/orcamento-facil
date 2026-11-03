import type { HttpClient } from "@/core/http/http-client";
import { attachmentsApi } from "./attachments";
import { authApi, biometricApi, usersApi } from "./auth";
import { categoriesApi, exchangeApi, seriesApi, tagsApi, transactionsApi, transfersApi, walletsApi } from "./finance";
import { notificationsApi, remindersApi } from "./notifications";
import { budgetsApi, goalsApi, reductionGoalsApi } from "./planning";
import { historyApi, reportsApi, systemApi } from "./reports";

export * from "./types";
export { fileForm, type LocalFile } from "./attachments";

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
    series: seriesApi(http),
    transfers: transfersApi(http),
    exchange: exchangeApi(http),
    reports: reportsApi(http),
    history: historyApi(http),
    budgets: budgetsApi(http),
    reductionGoals: reductionGoalsApi(http),
    goals: goalsApi(http),
    notifications: notificationsApi(http),
    reminders: remindersApi(http),
    attachments: attachmentsApi(http),
    system: systemApi(http),
  };
}

export type Api = ReturnType<typeof createApi>;
