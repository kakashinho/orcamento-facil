import { create } from "zustand";

/**
 * Modo de manutenção (R72). Fica ativo quando o status público informa manutenção ou quando
 * uma operação de escrita recebe 503 MAINTENANCE_MODE. Telas bloqueiam operações críticas.
 */
interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  setFromStatus: (enabled: boolean, message: string | null) => void;
  report: (message: string) => void;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  "O Orçamento Fácil está em manutenção. Consultas seguem disponíveis; registros e transferências estão temporariamente bloqueados.";

export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  enabled: false,
  message: null,
  setFromStatus: (enabled, message) => set({ enabled, message: enabled ? message : null }),
  report: (message) => set({ enabled: true, message }),
}));

/** Estado de manutenção para as telas. */
export function useMaintenance(): { active: boolean; message: string } {
  const enabled = useMaintenanceStore((s) => s.enabled);
  const message = useMaintenanceStore((s) => s.message);
  return { active: enabled, message: message ?? DEFAULT_MAINTENANCE_MESSAGE };
}
