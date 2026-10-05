import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { queryClient, session } from "@/data/client";
import { FeedbackProvider } from "@/features/feedback/feedback-provider";
import { AppSheetsProvider } from "@/features/shell/app-sheets";
import { ThemeProvider, type ColorScheme } from "@/ui";
import { authResult, categories, overview, summary, walletSummary } from "./fixtures";
import { createFakeApi, type FakeApi } from "./fake-api";

const metrics = {
  frame: { x: 0, y: 0, width: 400, height: 860 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

export function Providers({
  children,
  scheme = "light",
  sheets = false,
}: {
  children: ReactNode;
  scheme?: ColorScheme;
  sheets?: boolean;
}) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider scheme={scheme}>
          <FeedbackProvider>{sheets ? <AppSheetsProvider>{children}</AppSheetsProvider> : children}</FeedbackProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Renderiza com os provedores do app (tema, cache, feedback e, opcionalmente, folhas). */
export function renderWithProviders(ui: ReactElement, options: { scheme?: ColorScheme; sheets?: boolean } = {}) {
  return render(
    <Providers scheme={options.scheme} sheets={options.sheets}>
      {ui}
    </Providers>,
  );
}

/** Backend falso com respostas padrão das consultas mais usadas. */
export function setupApi(): FakeApi {
  queryClient.setDefaultOptions({
    queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  });
  return createFakeApi()
    .on("GET", "/api/system/status", {
      body: {
        status: "ok",
        version: "1.0.0",
        time: "2026-10-04T12:00:00.000Z",
        maintenance: { enabled: false, message: null },
      },
    })
    .on("GET", "/api/categories", (req) => ({
      body: {
        data: req.query.type ? categories.filter((c) => c.type === null || c.type === req.query.type) : categories,
      },
    }))
    .on("GET", "/api/tags", {
      body: { data: [{ id: "55555555-5555-4555-8555-555555555555", name: "trabalho", transactionCount: 1 }] },
    })
    .on("GET", "/api/wallets/summary", { body: walletSummary() })
    .on("GET", "/api/reports/overview", { body: overview() })
    .on("GET", "/api/transactions/summary", { body: summary() })
    .on("GET", "/api/currencies", {
      body: {
        data: [
          { code: "BRL", name: "Real brasileiro" },
          { code: "USD", name: "Dólar americano" },
          { code: "EUR", name: "Euro" },
        ],
        updatedAt: "2026-10-04T12:00:00.000Z",
        stale: false,
      },
    })
    .on("POST", "/api/categories/suggest", { body: { suggestions: [] } })
    .install();
}

/** Abre uma sessão como depois do login (token em memória, refresh no SecureStore). */
export async function signIn(overrides: Partial<typeof authResult.user> = {}) {
  await session.begin({ ...authResult, user: { ...authResult.user, ...overrides } });
}
