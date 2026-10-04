import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { AdminController } from "../controllers/admin.controller.js";
import { adminRouteSchemas as schemas } from "../schemas/admin.schema.js";

/** Prefixo: /api/admin — exige login (authenticate) e perfil de administrador (requireAdmin). */
export function adminRoutes(controller: AdminController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);
    app.addHook("preHandler", guards.requireAdmin);

    app.get("/maintenance", { schema: schemas.getMaintenance }, controller.getMaintenance);
    app.put("/maintenance", { schema: schemas.setMaintenance }, controller.setMaintenance);
    app.get("/logs", { schema: schemas.listLogs }, controller.listLogs);
    app.post("/housekeeping", { schema: schemas.housekeeping }, controller.housekeeping);
  };
}
