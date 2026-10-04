import type { Clock } from "../../../infrastructure/clock.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { systemRouteSchemas } from "../schemas/system.schema.js";
import type { HealthService } from "../services/health.service.js";
import type { MaintenanceService } from "../services/maintenance.service.js";
import { API_VERSION, DEFAULT_MAINTENANCE_MESSAGE } from "../types/system.types.js";

type Schemas = typeof systemRouteSchemas;

/** Rotas públicas de saúde e status. */
export class SystemController {
  constructor(
    private readonly health: HealthService,
    private readonly maintenance: MaintenanceService,
    private readonly clock: Clock,
  ) {}

  liveness = async (_request: ZodRequest<Schemas["liveness"]>, reply: ZodReply<Schemas["liveness"]>) => {
    return reply.send({ status: "ok" });
  };

  readiness = async (_request: ZodRequest<Schemas["readiness"]>, reply: ZodReply<Schemas["readiness"]>) => {
    if (await this.health.isDatabaseUp()) {
      return reply.send({ status: "ok", database: "up" });
    }
    return reply.status(503).send({ status: "degraded", database: "down" });
  };

  status = async (_request: ZodRequest<Schemas["status"]>, reply: ZodReply<Schemas["status"]>) => {
    const state = await this.maintenance.getState();
    return reply.send({
      status: "ok",
      version: API_VERSION,
      time: this.clock.now().toISOString(),
      maintenance: {
        enabled: state.enabled,
        message: state.enabled ? (state.message ?? DEFAULT_MAINTENANCE_MESSAGE) : null,
      },
    });
  };
}
