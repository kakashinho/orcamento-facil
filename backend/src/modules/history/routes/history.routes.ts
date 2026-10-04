import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { HistoryController } from "../controllers/history.controller.js";
import { historyRouteSchemas as schemas } from "../schemas/history.schema.js";

/** Prefixo: /api/history — todas as rotas exigem login. */
export function historyRoutes(controller: HistoryController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/undo", { schema: schemas.undo }, controller.undo);
  };
}
