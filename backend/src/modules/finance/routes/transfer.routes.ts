import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { TransferController } from "../controllers/transfer.controller.js";
import { transferRouteSchemas as schemas } from "../schemas/transfer.schema.js";

/** Prefixo: /api/transfers — todas as rotas exigem login. */
export function transferRoutes(controller: TransferController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.get("/:id", { schema: schemas.get }, controller.get);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
