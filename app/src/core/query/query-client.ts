import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";
import { isApiError } from "../http/api-error";

/**
 * Cache de dados do servidor (React Query) — R83/R86: telas reabertas aparecem na hora com o
 * cache e só buscam de novo o que ficou velho; nada é refeito sem necessidade.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnReconnect: true,
        // Não repete erros de regra (4xx) — só falhas de rede/servidor, uma vez.
        retry: (failureCount, error) =>
          failureCount < 1 && (!isApiError(error) || error.isNetworkError || error.status >= 500),
      },
      mutations: { retry: false },
    },
  });
}

/** Recarrega dados velhos quando o app volta ao primeiro plano. */
export function bindAppFocus(): () => void {
  const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
    focusManager.setFocused(status === "active");
  });
  return () => subscription.remove();
}
