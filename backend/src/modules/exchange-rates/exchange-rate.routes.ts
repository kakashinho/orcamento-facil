import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { RouteDeps } from "../../http/route-deps.js";
import { currencyCode, positiveAmount, secured } from "../../http/schemas.js";
import { fromCents, toCents } from "../../shared/money.js";

export function exchangeRateRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { exchangeRates } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Câmbio"],
          summary: "Taxas de câmbio atualizadas (R29)",
          description: "Fonte: ExchangeRate-API (open.er-api.com), com cache. `stale: true` indica cotação de cache após falha do provedor.",
          security: secured,
          querystring: z.object({
            base: currencyCode.default("BRL"),
            symbols: z
              .string()
              .regex(/^[A-Z]{3}(,[A-Z]{3})*$/, "Lista de códigos separados por vírgula")
              .optional()
              .meta({ example: "USD,EUR" }),
          }),
          response: {
            200: z.object({
              base: z.string(),
              rates: z.record(z.string(), z.number()),
              updatedAt: z.string(),
              source: z.string(),
              stale: z.boolean(),
            }),
          },
        },
      },
      async (request) => {
        const table = await exchangeRates.getRates(request.query.base, request.query.symbols?.split(","));
        return { ...table, updatedAt: table.updatedAt.toISOString() };
      },
    );

    app.get(
      "/convert",
      {
        schema: {
          tags: ["Câmbio"],
          summary: "Converter valor entre moedas (R29)",
          security: secured,
          querystring: z.object({ from: currencyCode, to: currencyCode, amount: z.coerce.number().pipe(positiveAmount) }),
          response: {
            200: z.object({
              from: z.string(),
              to: z.string(),
              amount: z.number(),
              result: z.number(),
              rate: z.number(),
              updatedAt: z.string(),
              stale: z.boolean(),
            }),
          },
        },
      },
      async (request) => {
        const { from, to, amount } = request.query;
        const { cents, quote } = await exchangeRates.convert(toCents(amount), from, to);
        return {
          from,
          to,
          amount,
          result: fromCents(cents),
          rate: Number(quote.rate),
          updatedAt: quote.updatedAt.toISOString(),
          stale: quote.stale,
        };
      },
    );
  };
}
