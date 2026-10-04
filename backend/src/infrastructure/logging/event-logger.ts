import type { Logger } from "./logger.js";

export type EventLevel = "info" | "warn" | "error";

export interface EventInput {
  level?: EventLevel;
  message?: string;
  userId?: string | null;
  requestId?: string | null;
  context?: Record<string, unknown>;
}

export interface LogEntry {
  level: EventLevel;
  event: string;
  message: string | null;
  context: Record<string, unknown> | null;
  userId: string | null;
  requestId: string | null;
}

/** Destino persistente dos eventos (implementado pelo repository de logs do módulo system). */
export interface LogSink {
  insert(entry: LogEntry): Promise<void>;
}

/**
 * Registro de eventos importantes e erros (R85): vai para o log estruturado (stdout) e para
 * o destino persistente. A gravação não bloqueia a requisição; `flush()` aguarda as pendentes.
 * Nunca registrar valores financeiros, senhas ou tokens no contexto.
 */
export class EventLogger {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly sink: LogSink,
    private readonly logger: Logger,
  ) {}

  record(event: string, input: EventInput = {}): void {
    const level = input.level ?? "info";
    this.logger[level](
      { event, userId: input.userId ?? undefined, reqId: input.requestId ?? undefined, ...input.context },
      input.message ?? event,
    );

    const write = this.sink
      .insert({
        level,
        event,
        message: input.message ?? null,
        context: input.context ?? null,
        userId: input.userId ?? null,
        requestId: input.requestId ?? null,
      })
      .catch((error: unknown) => {
        this.logger.error({ err: error, event }, "Falha ao persistir evento");
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
}
