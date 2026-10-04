import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { adminRouteSchemas } from "../schemas/admin.schema.js";
import type { AppLogService } from "../services/app-log.service.js";
import type { MaintenanceService } from "../services/maintenance.service.js";

type Schemas = typeof adminRouteSchemas;

/** Operações restritas ao perfil admin (a rota aplica o guard requireAdmin). */
export class AdminController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly logs: AppLogService,
  ) {}

  getMaintenance = async (_request: ZodRequest<Schemas["getMaintenance"]>, reply: ZodReply<Schemas["getMaintenance"]>) => {
    return reply.send(await this.maintenance.getState());
  };

  setMaintenance = async (request: ZodRequest<Schemas["setMaintenance"]>, reply: ZodReply<Schemas["setMaintenance"]>) => {
    return reply.send(await this.maintenance.setState(requireAuth(request).userId, request.body));
  };

  listLogs = async (request: ZodRequest<Schemas["listLogs"]>, reply: ZodReply<Schemas["listLogs"]>) => {
    const { event, level, before, limit } = request.query;
    return reply.send(
      await this.logs.list({ event, level, before: before ? new Date(before) : undefined, limit }),
    );
  };
}
