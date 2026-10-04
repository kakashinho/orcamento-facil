import { and, desc, eq, like, lt, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { appLogs } from "../db/schema.js";
import type { Logger } from "./logger.js";

export type EventLevel = "info" | "warn" | "error";

export interface EventInput {
  level?: EventLevel;
  message?: string;
  userId?: string | null;
  requestId?: string | null;
  context?: Record<string, unknown>;
}

export interface AppLogEntry {
  id: string;
  level: string;
  event: string;
  message: string | null;
  context: unknown;
  userId: string | null;
  requestId: string | null;
  createdAt: string;
}

/**
 * Registro de eventos importantes e erros (R85): vai para o log estruturado (stdout) e é
 * persistido em `app_logs` para consulta administrativa. A gravação não bloqueia a
 * requisição; `flush()` aguarda as pendentes no encerramento.
 * Nunca registrar valores financeiros, senhas ou tokens no contexto.
 */
export class EventLogger {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  record(event: string, input: EventInput = {}): void {
    const level = input.level ?? "info";
    this.logger[level](
      { event, userId: input.userId ?? undefined, reqId: input.requestId ?? undefined, ...input.context },
      input.message ?? event,
    );

    const write = this.db
      .insert(appLogs)
      .values({
        level,
        event,
        message: input.message ?? null,
        context: input.context ?? null,
        userId: input.userId ?? null,
        requestId: input.requestId ?? null,
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error({ err: error, event }, "Falha ao persistir evento em app_logs");
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  async list(filters: { event?: string; level?: string; before?: Date; limit: number }): Promise<AppLogEntry[]> {
    await this.flush();
    const conditions: SQL[] = [];
    if (filters.event) conditions.push(like(appLogs.event, `${filters.event.replace(/[\\%_]/g, "\\$&")}%`));
    if (filters.level) conditions.push(eq(appLogs.level, filters.level));
    if (filters.before) conditions.push(lt(appLogs.createdAt, filters.before));
    const rows = await this.db
      .select()
      .from(appLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(appLogs.createdAt))
      .limit(filters.limit);
    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      event: row.event,
      message: row.message,
      context: row.context,
      userId: row.userId,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
