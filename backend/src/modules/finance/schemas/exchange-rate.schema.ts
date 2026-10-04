import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, positiveAmount, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Câmbio"];

// ---------- Request DTOs ----------

export const exchangeRatesQuerySchema = z.object({
  base: currencyCode.default("BRL"),
  symbols: z
    .string()
    .regex(/^[A-Z]{3}(,[A-Z]{3})*$/, "Lista de códigos separados por vírgula")
    .optional()
    .meta({ example: "USD,EUR" }),
});
export type ExchangeRatesQueryDto = z.infer<typeof exchangeRatesQuerySchema>;

export const convertQuerySchema = z.object({
  from: currencyCode,
  to: currencyCode,
  amount: z.coerce.number().pipe(positiveAmount),
});
export type ConvertQueryDto = z.infer<typeof convertQuerySchema>;

// ---------- Response DTOs ----------

export const rateTableResponseSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.number()),
  updatedAt: z.string(),
  source: z.string(),
  stale: z.boolean().meta({ description: "true = cotação de cache após falha do provedor" }),
});

export const conversionResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.number(),
  result: z.number(),
  rate: z.number(),
  updatedAt: z.string(),
  stale: z.boolean(),
});

// ---------- Schemas das rotas (validação + documentação) ----------

export const exchangeRateRouteSchemas = {
  rates: {
    tags: TAGS,
    summary: "Taxas de câmbio atualizadas (R29)",
    description: "Fonte: ExchangeRate-API (open.er-api.com), com cache.",
    security: secured,
    querystring: exchangeRatesQuerySchema,
    response: { 200: rateTableResponseSchema },
  },
  convert: {
    tags: TAGS,
    summary: "Converter valor entre moedas (R29)",
    security: secured,
    querystring: convertQuerySchema,
    response: { 200: conversionResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
