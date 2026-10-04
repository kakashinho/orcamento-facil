import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { UserController } from "../controllers/user.controller.js";
import { userRouteSchemas as schemas } from "../schemas/user.schema.js";

/** Prefixo: /api/users — todas as rotas exigem login. */
export function userRoutes(controller: UserController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/me", { schema: schemas.getMe }, controller.getMe);
    app.patch("/me", { schema: schemas.updateMe }, controller.updateMe);
  };
}
