import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { TransactionController } from "../controllers/transaction.controller.js";
import { transactionRouteSchemas as schemas } from "../schemas/transaction.schema.js";

/** Prefixo: /api/transactions — todas as rotas exigem login. */
export function transactionRoutes(controller: TransactionController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.get("/summary", { schema: schemas.summary }, controller.summary);
    app.get("/months", { schema: schemas.months }, controller.months);
    app.post("/", { schema: schemas.create }, controller.create);
    app.post("/parse", { schema: schemas.parse }, controller.parse);
    app.post("/archive", { schema: schemas.archiveBefore }, controller.archiveBefore);
    app.get("/:id", { schema: schemas.get }, controller.get);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
    app.post("/:id/duplicate", { schema: schemas.duplicate }, controller.duplicate);
    app.post("/:id/archive", { schema: schemas.archive }, controller.archive);
    app.post("/:id/unarchive", { schema: schemas.unarchive }, controller.unarchive);
  };
}
