import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { SystemController } from "../controllers/system.controller.js";
import { systemRouteSchemas as schemas } from "../schemas/system.schema.js";

/** Rotas públicas (sem login): /health, /health/ready e /api/system/status. */
export function systemRoutes(controller: SystemController): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/health", { schema: schemas.liveness }, controller.liveness);
    app.get("/health/ready", { schema: schemas.readiness }, controller.readiness);
    app.get("/api/system/status", { schema: schemas.status }, controller.status);
  };
}
