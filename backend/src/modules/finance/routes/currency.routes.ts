import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ExchangeRateController } from "../controllers/exchange-rate.controller.js";
import { exchangeRateRouteSchemas as schemas } from "../schemas/exchange-rate.schema.js";

/** Prefixo: /api/currencies — pública: o cadastro (R02) já escolhe a moeda principal (R28). */
export function currencyRoutes(controller: ExchangeRateController): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/", { schema: schemas.currencies }, controller.currencies);
  };
}
