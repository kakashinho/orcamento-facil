import { and, desc, eq, like, lt, type SQL } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";
import { appLogs } from "../../../infrastructure/database/schema.js";
import type { LogEntry, LogSink } from "../../../infrastructure/logging/event-logger.js";
import { escapeLike } from "../../../shared/utils/text.js";
import type { AppLogFilters, AppLogRecord } from "../types/system.types.js";

/** Tabela `app_logs` (R85): destino persistente do EventLogger e fonte da consulta administrativa. */
export class AppLogRepository extends Repository implements LogSink {
  async insert(entry: LogEntry): Promise<void> {
    await this.db.insert(appLogs).values(entry);
  }

  async list(filters: AppLogFilters): Promise<AppLogRecord[]> {
    const conditions: SQL[] = [];
    if (filters.event) conditions.push(like(appLogs.event, `${escapeLike(filters.event)}%`));
    if (filters.level) conditions.push(eq(appLogs.level, filters.level));
    if (filters.before) conditions.push(lt(appLogs.createdAt, filters.before));
    return this.db
      .select()
      .from(appLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(appLogs.createdAt))
      .limit(filters.limit);
  }
}
