/* Executado depois do ambiente do Jest: limpa estados globais entre os testes. */
import { cleanup } from "@testing-library/react-native";
import { notifyManager } from "@tanstack/react-query";
import { act } from "react";
import { queryClient } from "@/data/client";
import { useSessionStore } from "@/data/session/session-store";
import { useMaintenanceStore } from "@/data/system/maintenance-store";
import { useServerAddress } from "@/core/config/server-address";
import { useThemePreference } from "@/features/preferences/theme-preference";
import { logger } from "@/core/logging/logger";
import { secureStoreData, speechEvents } from "@/test-utils/native-mocks";

// Atualizações do React Query (respostas que chegam depois) entram no ciclo do act.
notifyManager.setNotifyFunction((fn) => {
  act(fn);
});

const initialSession = useSessionStore.getState();
const initialMaintenance = useMaintenanceStore.getState();
const initialTheme = useThemePreference.getState();
const initialServer = useServerAddress.getState();

afterEach(async () => {
  // Desmonta as telas antes de reiniciar os estados globais (evita atualizações fora do act).
  await cleanup();
  queryClient.clear();
  useSessionStore.setState(initialSession, true);
  useMaintenanceStore.setState(initialMaintenance, true);
  useThemePreference.setState(initialTheme, true);
  useServerAddress.setState(initialServer, true);
  logger.clear();
  secureStoreData().clear();
  speechEvents.__reset();
});
