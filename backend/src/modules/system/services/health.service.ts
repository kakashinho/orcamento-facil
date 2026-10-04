import type { Logger } from "../../../infrastructure/logging/logger.js";
import type { HealthRepository } from "../repositories/health.repository.js";

/** Saúde da aplicação (R85) para orquestrador e monitoramento. */
export class HealthService {
  constructor(
    private readonly health: HealthRepository,
    private readonly logger: Logger,
  ) {}

  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.health.ping();
      return true;
    } catch (error) {
      this.logger.error({ err: error }, "Banco de dados indisponível no readiness check");
      return false;
    }
  }
}
