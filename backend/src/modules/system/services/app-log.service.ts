import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { AppLogRepository } from "../repositories/app-log.repository.js";
import type { AppLogListResponseDto } from "../schemas/admin.schema.js";
import type { AppLogFilters } from "../types/system.types.js";

/** Consulta administrativa dos eventos importantes e erros (R85). */
export class AppLogService {
  constructor(
    private readonly logs: AppLogRepository,
    private readonly eventLog: EventLogger,
  ) {}

  async list(filters: AppLogFilters): Promise<AppLogListResponseDto> {
    // Garante que eventos ainda em gravação apareçam na consulta.
    await this.eventLog.flush();
    const rows = await this.logs.list(filters);
    return { data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  }
}
