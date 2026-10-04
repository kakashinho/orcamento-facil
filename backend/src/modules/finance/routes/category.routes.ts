import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { CategoryController } from "../controllers/category.controller.js";
import { categoryRouteSchemas as schemas } from "../schemas/category.schema.js";

/** Prefixo: /api/categories — todas as rotas exigem login. */
export function categoryRoutes(controller: CategoryController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.post("/suggest", { schema: schemas.suggest }, controller.suggest);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
