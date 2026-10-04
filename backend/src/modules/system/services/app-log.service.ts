import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { AppLogRepository } from "../repositories/app-log.repository.js";
import type { AppLogListResponseDto } from "../schemas/admin.schema.js";
import type { AppLogFilters } from "../types/system.types.js";

const DAY_MS = 86_400_000;

/** Consulta administrativa dos eventos importantes e erros (R85) e a retenção deles. */
export class AppLogService {
  constructor(
    private readonly logs: AppLogRepository,
    private readonly eventLog: EventLogger,
    private readonly retentionDays: number,
  ) {}

  async list(filters: AppLogFilters): Promise<AppLogListResponseDto> {
    // Garante que eventos ainda em gravação apareçam na consulta.
    await this.eventLog.flush();
    const rows = await this.logs.list(filters);
    return { data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  }

  /** Limpeza periódica: eventos mais antigos que a retenção configurada. */
  purgeExpired(now: Date): Promise<number> {
    return this.logs.deleteOlderThan(new Date(now.getTime() - this.retentionDays * DAY_MS));
  }
}
