import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { WalletController } from "../controllers/wallet.controller.js";
import { walletRouteSchemas as schemas } from "../schemas/wallet.schema.js";

/** Prefixo: /api/wallets — todas as rotas exigem login. */
export function walletRoutes(controller: WalletController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.get("/summary", { schema: schemas.summary }, controller.summary);
    app.post("/", { schema: schemas.create }, controller.create);
    app.get("/:id", { schema: schemas.get }, controller.get);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
