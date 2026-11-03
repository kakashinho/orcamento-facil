import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { ReductionGoalController } from "../controllers/reduction-goal.controller.js";
import { reductionGoalRouteSchemas as schemas } from "../schemas/reduction-goal.schema.js";

/** Prefixo: /api/reduction-goals — todas as rotas exigem login. */
export function reductionGoalRoutes(controller: ReductionGoalController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
