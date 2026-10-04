import type { Clock } from "../../../infrastructure/clock.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { HousekeepingResponseDto } from "../schemas/admin.schema.js";
import type { HousekeepingTask } from "../types/system.types.js";

/**
 * Limpeza periódica (R85, R83): remove dados vencidos que só ocupam espaço e deixam as consultas
 * mais lentas — sessões expiradas, links de recuperação vencidos, histórico além da retenção e
 * logs antigos. Cada módulo fornece a sua tarefa; o system não conhece as tabelas dos outros.
 */
export class HousekeepingService {
  private running: Promise<HousekeepingResponseDto> | null = null;

  constructor(
    private readonly tasks: HousekeepingTask[],
    private readonly clock: Clock,
    private readonly eventLog: EventLogger,
  ) {}

  /** Executa todas as tarefas; chamadas simultâneas aguardam a mesma execução. */
  run(): Promise<HousekeepingResponseDto> {
    this.running ??= this.execute().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async execute(): Promise<HousekeepingResponseDto> {
    const now = this.clock.now();
    const results: HousekeepingResponseDto["results"] = [];
    for (const task of this.tasks) {
      try {
        results.push({ task: task.name, removed: await task.run(now), failed: false });
      } catch (error) {
        results.push({ task: task.name, removed: 0, failed: true });
        this.eventLog.record("system.housekeeping_failed", {
          level: "error",
          message: error instanceof Error ? error.message : String(error),
          context: { task: task.name },
        });
      }
    }
    if (results.some((result) => result.removed > 0)) {
      this.eventLog.record("system.housekeeping", {
        context: Object.fromEntries(results.map((result) => [result.task, result.removed])),
      });
    }
    return { ranAt: now.toISOString(), results };
  }

  /** Agenda a execução automática; devolve a função que cancela o agendamento. */
  schedule(intervalMinutes: number): () => void {
    if (intervalMinutes <= 0) return () => undefined;
    const timer = setInterval(() => void this.run(), intervalMinutes * 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }
}
