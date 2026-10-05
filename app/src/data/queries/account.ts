import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { env } from "@/core/config/env";
import type { UpdateProfileRequest } from "../api/types";
import { api, queryClient } from "../client";
import { useSessionStore } from "../session/session-store";
import { useMaintenanceStore } from "../system/maintenance-store";
import { invalidateFinance, queryKeys } from "./keys";

/** Atualiza o perfil (moeda principal — R28, tema — R42) e reflete na sessão. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.users.updateMe(body),
    onSuccess: (user, body) => {
      useSessionStore.getState().setUser(user);
      // Trocar a moeda principal muda todos os totais convertidos.
      if (body.primaryCurrency) void invalidateFinance(queryClient);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.auth.changePassword(currentPassword, newPassword),
  });
}

/**
 * Consulta o status público periodicamente e ao voltar ao app (R72): o usuário é avisado da
 * manutenção antes de tentar uma operação crítica.
 */
export function useSystemStatus() {
  const query = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: () => api.system.status(),
    refetchInterval: env.statusPollMs,
    staleTime: 15_000,
  });
  const data = query.data;
  useEffect(() => {
    if (data) useMaintenanceStore.getState().setFromStatus(data.maintenance.enabled, data.maintenance.message);
  }, [data]);
  return query;
}

/** Liga/desliga a manutenção (somente administradores). */
export function useSetMaintenance() {
  return useMutation({
    mutationFn: (enabled: boolean) => api.system.setMaintenance(enabled),
    onSuccess: (state) => {
      useMaintenanceStore.getState().setFromStatus(state.enabled, state.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus });
    },
  });
}
