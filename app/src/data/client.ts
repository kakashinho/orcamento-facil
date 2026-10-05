import { env } from "@/core/config/env";
import { createHttpClient } from "@/core/http/http-client";
import { logger } from "@/core/logging/logger";
import { createQueryClient } from "@/core/query/query-client";
import { secureStorage } from "@/core/storage/secure-storage";
import { createApi } from "./api";
import { createSessionManager } from "./session/session-manager";
import { useSessionStore } from "./session/session-store";
import { useMaintenanceStore } from "./system/maintenance-store";

/**
 * Raiz de composição da camada de dados: liga cliente HTTP, sessão, cache e estados globais.
 * Telas e hooks usam `api`, `session` e `queryClient` daqui; os testes trocam o `fetch` global.
 */
export const queryClient = createQueryClient();

// O cliente precisa da sessão (token) e a sessão precisa da API (refresh): a referência é tardia.
let sessionRef: ReturnType<typeof createSessionManager> | null = null;

export const http = createHttpClient({
  baseUrl: env.apiUrl,
  logger,
  session: {
    getAccessToken: () => sessionRef?.getAccessToken() ?? Promise.resolve(null),
    refresh: () => sessionRef?.refresh() ?? Promise.resolve(null),
  },
  onSessionExpired: () => sessionRef?.expire(),
  onMaintenance: (message) => useMaintenanceStore.getState().report(message),
});

export const api = createApi(http);

export const session = createSessionManager({
  storage: secureStorage,
  refreshTokens: (refreshToken) => api.auth.refresh(refreshToken),
  revokeRefreshToken: (refreshToken) => api.auth.logout(refreshToken),
  fetchMe: () => api.users.me(),
  store: useSessionStore,
  logger,
  onSignedOut: () => queryClient.clear(),
});
sessionRef = session;
