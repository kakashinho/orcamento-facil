import type { FastifySchema } from "fastify";
import { z } from "zod";
import { isoDate, isoMonth, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Relatórios"];

const kind = z.enum(["income", "expense", "transfer_in", "transfer_out"]);
const categoryInfo = z.object({ id: z.string(), name: z.string() }).nullable();

// ---------- Request DTOs ----------

export const periodQuerySchema = z.object({ from: isoDate, to: isoDate, walletId: z.uuid().optional() });
export type PeriodQueryDto = z.infer<typeof periodQuerySchema>;

export const byCategoryQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  type: z.enum(["income", "expense"]).default("expense"),
});
export type ByCategoryQueryDto = z.infer<typeof byCategoryQuerySchema>;

export const monthlyQuerySchema = z.object({ fromMonth: isoMonth, toMonth: isoMonth });
export type MonthlyQueryDto = z.infer<typeof monthlyQuerySchema>;

// ---------- Response DTOs ----------

export const statementResponseSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    generatedAt: z.string(),
    wallets: z.array(
      z.object({
        wallet: z.object({ id: z.string(), name: z.string(), currency: z.string(), type: z.string() }),
        openingBalance: z.number(),
        totalIn: z.number(),
        totalOut: z.number(),
        closingBalance: z.number(),
        entries: z.array(
          z.object({
            date: z.string(),
            kind,
            referenceId: z.string(),
            description: z.string(),
            category: categoryInfo,
            amount: z.number().meta({ description: "Com sinal: positivo entra, negativo sai" }),
            balance: z.number().meta({ description: "Saldo após o movimento" }),
          }),
        ),
      }),
    ),
  })
  .meta({ id: "Statement" });
export type StatementResponseDto = z.infer<typeof statementResponseSchema>;

const convertedTotalsSchema = z.object({
  currency: z.string(),
  inflow: z.number(),
  outflow: z.number(),
  net: z.number(),
  ratesUpdatedAt: z.string().nullable(),
  ratesStale: z.boolean(),
});
export type ConvertedTotalsDto = z.infer<typeof convertedTotalsSchema>;

export const cashFlowResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  walletId: z.string().nullable(),
  primaryCurrency: z.string(),
  entries: z.array(
    z.object({
      date: z.string(),
      kind,
      referenceId: z.string(),
      description: z.string(),
      wallet: z.object({ id: z.string(), name: z.string(), currency: z.string() }),
      category: categoryInfo,
      amount: z.number(),
    }),
  ),
  totals: z.array(z.object({ currency: z.string(), inflow: z.number(), outflow: z.number(), net: z.number() })),
  convertedTotal: convertedTotalsSchema.nullable(),
});
export type CashFlowResponseDto = z.infer<typeof cashFlowResponseSchema>;

export const byCategoryResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["income", "expense"]),
  primaryCurrency: z.string(),
  convertedTotal: z.number().nullable(),
  categories: z.array(
    z.object({
      category: categoryInfo,
      count: z.number(),
      totals: z.array(z.object({ currency: z.string(), total: z.number() })),
      convertedTotal: z.number().nullable(),
      share: z.number().nullable().meta({ description: "Percentual do total" }),
    }),
  ),
});
export type ByCategoryResponseDto = z.infer<typeof byCategoryResponseSchema>;

export const monthlyResponseSchema = z.object({
  fromMonth: z.string(),
  toMonth: z.string(),
  primaryCurrency: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      totals: z.array(z.object({ currency: z.string(), income: z.number(), expense: z.number(), net: z.number() })),
      converted: z.object({ income: z.number(), expense: z.number(), net: z.number() }).nullable(),
    }),
  ),
});
export type MonthlyResponseDto = z.infer<typeof monthlyResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const reportRouteSchemas = {
  statement: {
    tags: TAGS,
    summary: "Extrato do período (R41)",
    description: "Por carteira: saldo inicial, movimentos em ordem cronológica com saldo corrente, totais e saldo final.",
    security: secured,
    querystring: periodQuerySchema,
    response: { 200: statementResponseSchema },
  },
  statementPdf: {
    tags: TAGS,
    summary: "Extrato do período em PDF (R41)",
    security: secured,
    querystring: periodQuerySchema,
    produces: ["application/pdf"],
  },
  cashFlow: {
    tags: TAGS,
    summary: "Fluxo de caixa do período (R58)",
    description:
      "Todas as entradas e saídas em ordem cronológica, com totais por moeda e total convertido para a moeda principal. Sem `walletId`, transferências internas são omitidas.",
    security: secured,
    querystring: periodQuerySchema,
    response: { 200: cashFlowResponseSchema },
  },
  byCategory: {
    tags: TAGS,
    summary: "Totais por categoria no período (gráfico de pizza)",
    security: secured,
    querystring: byCategoryQuerySchema,
    response: { 200: byCategoryResponseSchema },
  },
  monthly: {
    tags: TAGS,
    summary: "Receitas e despesas por mês (gráfico de evolução)",
    security: secured,
    querystring: monthlyQuerySchema,
    response: { 200: monthlyResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
