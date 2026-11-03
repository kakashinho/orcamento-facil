import type { Clock } from "../../../infrastructure/clock.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { JobLockRepository } from "../repositories/job-lock.repository.js";
import type { JobsRunResponseDto } from "../schemas/admin.schema.js";
import type { JobRunResult, JobTask } from "../types/system.types.js";
import type { MaintenanceService } from "./maintenance.service.js";

/**
 * Tarefas agendadas de negócio (ADR-S2-004): gerar ocorrências de séries, lembretes, reenvio de
 * push. Diferente do housekeeping, escrevem dados do usuário — por isso cada tarefa roda sob trava
 * no banco (uma instância por vez) e nada roda durante o modo de manutenção (R72). Cada módulo
 * fornece as suas tarefas; o system só agenda, sem conhecer as tabelas dos outros.
 */
export class JobScheduler {
  private running: Promise<JobsRunResponseDto> | null = null;

  constructor(
    private readonly tasks: JobTask[],
    private readonly lock: JobLockRepository,
    private readonly maintenance: MaintenanceService,
    private readonly clock: Clock,
    private readonly eventLog: EventLogger,
  ) {}

  /** Executa todas as tarefas uma vez; chamadas simultâneas aguardam a mesma execução. */
  runOnce(): Promise<JobsRunResponseDto> {
    this.running ??= this.execute().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async execute(): Promise<JobsRunResponseDto> {
    const ranAt = this.clock.now();
    const results: JobRunResult[] = [];
    if ((await this.maintenance.getState()).enabled) {
      for (const task of this.tasks) {
        results.push({ job: task.name, processed: 0, skipped: true, failed: false, reason: "maintenance" });
      }
      return { ranAt: ranAt.toISOString(), results };
    }

    for (const task of this.tasks) {
      try {
        const outcome = await this.lock.withLock(`job:${task.name}`, () => task.run(this.clock.now()));
        results.push(
          outcome.locked
            ? { job: task.name, processed: outcome.result.processed, skipped: false, failed: false, reason: null }
            : { job: task.name, processed: 0, skipped: true, failed: false, reason: "locked" },
        );
      } catch (error) {
        results.push({ job: task.name, processed: 0, skipped: false, failed: true, reason: null });
        this.eventLog.record("system.job_failed", {
          level: "error",
          message: error instanceof Error ? error.message : String(error),
          context: { job: task.name },
        });
      }
    }
    if (results.some((result) => result.processed > 0)) {
      this.eventLog.record("system.jobs", {
        context: Object.fromEntries(results.map((result) => [result.job, result.processed])),
      });
    }
    return { ranAt: ranAt.toISOString(), results };
  }

  /** Agenda a execução automática; devolve a função que cancela o agendamento. */
  schedule(intervalMinutes: number): () => void {
    if (intervalMinutes <= 0) return () => undefined;
    const timer = setInterval(() => void this.runOnce(), intervalMinutes * 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }
}
