import type { Clock } from "../../../infrastructure/clock.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { SystemSettingsRepository } from "../repositories/system-settings.repository.js";
import type { MaintenanceState } from "../types/system.types.js";

const CACHE_TTL_MS = 5_000;

/**
 * Modo de manutenção (R72): durante atualizações, o usuário é informado e operações que
 * alteram dados são bloqueadas. O estado fica no banco (vale para todas as instâncias) e é
 * cacheado por alguns segundos para não custar uma consulta por requisição.
 */
export class MaintenanceService {
  private cache: { state: MaintenanceState; expiresAt: number } | null = null;

  constructor(
    private readonly settings: SystemSettingsRepository,
    private readonly clock: Clock,
    private readonly eventLog: EventLogger,
    private readonly forced: boolean,
  ) {}

  async getState(): Promise<MaintenanceState> {
    const now = this.clock.now().getTime();
    if (this.cache && this.cache.expiresAt > now) return this.cache.state;

    const row = await this.settings.get();
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
    const message = input.message?.trim() || null;
    await this.settings.saveMaintenance({ enabled: input.enabled, message, updatedBy: adminUserId, now: this.clock.now() });
    this.cache = null;
    this.eventLog.record(input.enabled ? "system.maintenance_enabled" : "system.maintenance_disabled", {
      level: "warn",
      userId: adminUserId,
      ...(message ? { context: { message } } : {}),
    });
    return this.getState();
  }
}
