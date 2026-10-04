import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { systemSettings } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import type { EventLogger } from "../../infra/event-log.js";

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  /** Ativado por variável de ambiente (ex.: durante o deploy); não pode ser desligado pela API. */
  forced: boolean;
  updatedAt: string | null;
}

export const DEFAULT_MAINTENANCE_MESSAGE =
  "O Orçamento Fácil está em manutenção para atualização. Operações de alteração estão temporariamente suspensas.";

const CACHE_TTL_MS = 5_000;

/**
 * Modo de manutenção (R72): durante atualizações, o usuário é informado e operações que
 * alteram dados são bloqueadas. O estado fica no banco (vale para todas as instâncias) e é
 * cacheado por alguns segundos para não custar uma consulta por requisição.
 */
export class MaintenanceService {
  private cache: { state: MaintenanceState; expiresAt: number } | null = null;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly eventLog: EventLogger,
    private readonly forced: boolean,
  ) {}

  async getState(): Promise<MaintenanceState> {
    const now = this.clock.now().getTime();
    if (this.cache && this.cache.expiresAt > now) return this.cache.state;

    const [row] = await this.db.select().from(systemSettings).where(eq(systemSettings.id, 1));
    const state: MaintenanceState = {
      enabled: this.forced || (row?.maintenanceEnabled ?? false),
      message: row?.maintenanceMessage ?? null,
      forced: this.forced,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
    this.cache = { state, expiresAt: now + CACHE_TTL_MS };
    return state;
  }

  async setState(adminUserId: string, input: { enabled: boolean; message?: string | null | undefined }): Promise<MaintenanceState> {
    const now = this.clock.now();
    const message = input.message === undefined ? null : input.message?.trim() || null;
    await this.db
      .insert(systemSettings)
      .values({ id: 1, maintenanceEnabled: input.enabled, maintenanceMessage: message, updatedBy: adminUserId, updatedAt: now })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { maintenanceEnabled: input.enabled, maintenanceMessage: message, updatedBy: adminUserId, updatedAt: now },
      });
    this.cache = null;
    this.eventLog.record(input.enabled ? "system.maintenance_enabled" : "system.maintenance_disabled", {
      level: "warn",
      userId: adminUserId,
      ...(message ? { context: { message } } : {}),
    });
    return this.getState();
  }
}
