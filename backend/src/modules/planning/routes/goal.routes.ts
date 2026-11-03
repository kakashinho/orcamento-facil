import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { GoalController } from "../controllers/goal.controller.js";
import { goalRouteSchemas as schemas } from "../schemas/goal.schema.js";

/** Prefixo: /api/goals — todas as rotas exigem login. */
export function goalRoutes(controller: GoalController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.get("/contributions", { schema: schemas.contributionsByTransaction }, controller.contributionsByTransaction);
    app.get("/:id", { schema: schemas.get }, controller.get);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.cancel }, controller.cancel);
    app.post("/:id/contributions", { schema: schemas.addContribution }, controller.addContribution);
    app.delete("/:id/contributions/:contributionId", { schema: schemas.removeContribution }, controller.removeContribution);
  };
}
