import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { ExchangeRateController } from "../controllers/exchange-rate.controller.js";
import { exchangeRateRouteSchemas as schemas } from "../schemas/exchange-rate.schema.js";

/** Prefixo: /api/exchange-rates — todas as rotas exigem login. */
export function exchangeRateRoutes(controller: ExchangeRateController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.rates }, controller.rates);
    app.get("/convert", { schema: schemas.convert }, controller.convert);
  };
}
