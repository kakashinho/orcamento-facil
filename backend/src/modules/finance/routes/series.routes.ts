import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { SeriesController } from "../controllers/series.controller.js";
import { seriesRouteSchemas as schemas } from "../schemas/series.schema.js";

/** Prefixo: /api/series — todas as rotas exigem login. */
export function seriesRoutes(controller: SeriesController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/recurring", { schema: schemas.createRecurring }, controller.createRecurring);
    app.post("/recurring/from-transaction/:transactionId", { schema: schemas.markRecurring }, controller.markRecurring);
    app.post("/installments", { schema: schemas.createInstallments }, controller.createInstallments);
    app.get("/:id", { schema: schemas.get }, controller.get);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.cancel }, controller.cancel);
  };
}
