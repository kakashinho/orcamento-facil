import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { BudgetController } from "../controllers/budget.controller.js";
import { budgetRouteSchemas as schemas } from "../schemas/budget.schema.js";

/** Prefixo: /api/budgets — todas as rotas exigem login. */
export function budgetRoutes(controller: BudgetController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.get("/status", { schema: schemas.status }, controller.status);
    app.get("/history", { schema: schemas.history }, controller.history);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
