export const API_VERSION = "1.0.0";

export const DEFAULT_MAINTENANCE_MESSAGE =
  "O Orçamento Fácil está em manutenção para atualização. Operações de alteração estão temporariamente suspensas.";

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  /** Ativado por variável de ambiente (ex.: durante o deploy); não pode ser desligado pela API. */
  forced: boolean;
  updatedAt: string | null;
}

export interface SystemSettingsRecord {
  maintenanceEnabled: boolean;
  maintenanceMessage: string | null;
  updatedAt: Date;
}

export interface AppLogRecord {
  id: string;
  level: string;
  event: string;
  message: string | null;
  context: unknown;
  userId: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Tarefa de limpeza fornecida pelo módulo dono do dado (o system só agenda e registra):
 * remove o que venceu até `now` e devolve quantos registros saíram.
 */
export interface HousekeepingTask {
  name: string;
  run(now: Date): Promise<number>;
}

export interface AppLogFilters {
  event?: string | undefined;
  level?: string | undefined;
  before?: Date | undefined;
  limit: number;
}
