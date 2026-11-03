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

/**
 * Tarefa agendada de negócio (ex.: gerar parcelas, enviar lembretes), fornecida pelo módulo dono
 * do dado. Precisa ser idempotente: rodar duas vezes no mesmo minuto não pode duplicar nada.
 */
export interface JobTask {
  name: string;
  /** Devolve quantos itens processou (ex.: ocorrências criadas, avisos enviados). */
  run(now: Date): Promise<{ processed: number }>;
}

export interface JobRunResult {
  job: string;
  processed: number;
  skipped: boolean;
  failed: boolean;
  /** Motivo de pular: "maintenance" (modo de manutenção) ou "locked" (outra instância rodando). */
  reason: "maintenance" | "locked" | null;
}

export interface AppLogFilters {
  event?: string | undefined;
  level?: string | undefined;
  before?: Date | undefined;
  limit: number;
}
