import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, positiveAmount, responseTimestamp, secured } from "../../../infrastructure/http/common-schemas.js";
import { isSupportedCurrency } from "../../../shared/utils/money.js";

const TAGS = ["Câmbio"];

// ---------- Request DTOs ----------

export const exchangeRatesQuerySchema = z.strictObject({
  base: currencyCode.default("BRL"),
  symbols: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}(,[A-Z]{3})*$/, { message: "Use códigos de 3 letras separados por vírgula (ex.: USD,EUR).", abort: true })
    .refine((value) => value.split(",").every(isSupportedCurrency), "Há moeda não suportada na lista.")
    .optional()
    .meta({ description: "Filtra as moedas da resposta", example: "USD,EUR" }),
});
export type ExchangeRatesQueryDto = z.infer<typeof exchangeRatesQuerySchema>;

export const convertQuerySchema = z.strictObject({
  from: currencyCode,
  to: currencyCode,
  amount: z.coerce.number("Informe um número.").pipe(positiveAmount),
});
export type ConvertQueryDto = z.infer<typeof convertQuerySchema>;

// ---------- Response DTOs ----------

const stale = z.boolean().meta({ description: "true = cotação de cache após falha do provedor" });

export const rateTableResponseSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.number()),
  updatedAt: responseTimestamp,
  source: z.string(),
  stale,
});
export type RateTableResponseDto = z.infer<typeof rateTableResponseSchema>;

export const conversionResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.number(),
  result: z.number(),
  rate: z.number(),
  updatedAt: responseTimestamp,
  stale,
});
export type ConversionResponseDto = z.infer<typeof conversionResponseSchema>;

export const currencyListResponseSchema = z.object({
  data: z.array(z.object({ code: z.string().meta({ example: "BRL" }), name: z.string().meta({ example: "Real brasileiro" }) })),
  updatedAt: responseTimestamp,
  stale,
});
export type CurrencyListResponseDto = z.infer<typeof currencyListResponseSchema>;

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
  currencies: {
    tags: TAGS,
    summary: "Moedas disponíveis, com nome em português (R28, R56)",
    description:
      "Moedas aceitas pela API e com cotação no provedor — use para o seletor de moeda principal (inclusive no cadastro, por isso é pública) e de moeda da carteira. Com o provedor fora e sem cache, devolve as moedas mais usadas com `stale: true`.",
    response: { 200: currencyListResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
