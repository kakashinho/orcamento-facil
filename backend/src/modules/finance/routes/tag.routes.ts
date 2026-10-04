import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { TagController } from "../controllers/tag.controller.js";
import { tagRouteSchemas as schemas } from "../schemas/tag.schema.js";

/** Prefixo: /api/tags — todas as rotas exigem login. */
export function tagRoutes(controller: TagController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.patch("/:id", { schema: schemas.rename }, controller.rename);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
