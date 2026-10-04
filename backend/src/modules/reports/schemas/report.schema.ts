import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  dateRangeRule,
  isoDate,
  isoMonth,
  MAX_PERIOD_DAYS,
  MAX_PERIOD_MONTHS,
  responseDate,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { monthsBetween } from "../../../shared/utils/dates.js";
import { transactionResponseSchema, transactionSummaryResponseSchema } from "../../finance/schemas/transaction.schema.js";
import { walletSummaryResponseSchema } from "../../finance/schemas/wallet.schema.js";

const TAGS = ["Relatórios"];

const kind = z
  .enum(["income", "expense", "transfer_in", "transfer_out"])
  .meta({ description: "income/expense = transação; transfer_in/transfer_out = transferência entre carteiras" });
const categoryInfo = z.object({ id: responseId, name: z.string() }).nullable();
const categoryType = z.enum(["income", "expense"]);

// ---------- Request DTOs ----------

export const periodQuerySchema = z
  .strictObject({
    from: isoDate.meta({ description: "Data inicial (inclusive)" }),
    to: isoDate.meta({ description: "Data final (inclusive); período máximo de 5 anos" }),
    walletId: uuid().optional(),
  })
  .superRefine(dateRangeRule("from", "to", MAX_PERIOD_DAYS));
export type PeriodQueryDto = z.infer<typeof periodQuerySchema>;

export const byCategoryQuerySchema = z
  .strictObject({
    from: isoDate,
    to: isoDate,
    type: categoryType.default("expense"),
  })
  .superRefine(dateRangeRule("from", "to", MAX_PERIOD_DAYS));
export type ByCategoryQueryDto = z.infer<typeof byCategoryQuerySchema>;

export const monthlyQuerySchema = z
  .strictObject({ fromMonth: isoMonth, toMonth: isoMonth })
  .superRefine((value, ctx) => {
    if (value.fromMonth > value.toMonth) {
      ctx.addIssue({ code: "custom", path: ["toMonth"], message: "O mês final deve ser igual ou posterior ao inicial." });
    } else if (monthsBetween(value.fromMonth, value.toMonth).length > MAX_PERIOD_MONTHS) {
      ctx.addIssue({ code: "custom", path: ["toMonth"], message: `O período máximo é de ${MAX_PERIOD_MONTHS} meses.` });
    }
  });
export type MonthlyQueryDto = z.infer<typeof monthlyQuerySchema>;

export const overviewQuerySchema = z.strictObject({
  month: isoMonth.optional().meta({ description: "Mês do resumo. Padrão: mês atual no fuso do usuário" }),
});
export type OverviewQueryDto = z.infer<typeof overviewQuerySchema>;

// ---------- Response DTOs ----------

export const statementResponseSchema = z
  .object({
    from: responseDate,
    to: responseDate,
    generatedAt: responseTimestamp,
    wallets: z.array(
      z.object({
        wallet: z.object({ id: responseId, name: z.string(), currency: z.string(), type: z.string() }),
        openingBalance: z.number(),
        totalIn: z.number(),
        totalOut: z.number(),
        closingBalance: z.number(),
        entries: z.array(
          z.object({
            date: responseDate,
            kind,
            referenceId: responseId,
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
  ratesUpdatedAt: responseTimestamp.nullable(),
  ratesStale: z.boolean(),
});
export type ConvertedTotalsDto = z.infer<typeof convertedTotalsSchema>;

export const cashFlowResponseSchema = z.object({
  from: responseDate,
  to: responseDate,
  walletId: responseId.nullable(),
  primaryCurrency: z.string(),
  entries: z.array(
    z.object({
      date: responseDate,
      kind,
      referenceId: responseId,
      description: z.string(),
      wallet: z.object({ id: responseId, name: z.string(), currency: z.string() }),
      category: categoryInfo,
      amount: z.number(),
    }),
  ),
  totals: z.array(z.object({ currency: z.string(), inflow: z.number(), outflow: z.number(), net: z.number() })),
  convertedTotal: convertedTotalsSchema.nullable(),
});
export type CashFlowResponseDto = z.infer<typeof cashFlowResponseSchema>;

const categoryTotalsSchema = z.object({
  category: categoryInfo.meta({ description: "null = transações sem categoria" }),
  count: z.number(),
  totals: z.array(z.object({ currency: z.string(), total: z.number() })),
  convertedTotal: z.number().nullable(),
  share: z.number().nullable().meta({ description: "Percentual do total" }),
});

export const byCategoryResponseSchema = z.object({
  from: responseDate,
  to: responseDate,
  type: categoryType,
  primaryCurrency: z.string(),
  convertedTotal: z.number().nullable(),
  categories: z.array(categoryTotalsSchema),
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

export const overviewResponseSchema = z
  .object({
    month: z.string(),
    wallets: walletSummaryResponseSchema,
    monthSummary: transactionSummaryResponseSchema,
    topExpenseCategories: z.array(categoryTotalsSchema).meta({ description: "Até 5 categorias com mais despesas no mês" }),
    recentTransactions: z.array(transactionResponseSchema).meta({ description: "Últimas 5 transações da lista principal" }),
  })
  .meta({ id: "Overview" });
export type OverviewResponseDto = z.infer<typeof overviewResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const reportRouteSchemas = {
  overview: {
    tags: TAGS,
    summary: "Tela inicial em uma requisição: saldos (R55), resumo do mês, maiores despesas e últimas transações",
    description:
      "Reúne o que a tela inicial mostra para carregar com uma única ida ao servidor em rede móvel (R83, R86).",
    security: secured,
    querystring: overviewQuerySchema,
    response: { 200: overviewResponseSchema },
  },
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
    description: "Mesmo conteúdo do extrato, como arquivo application/pdf para download (Content-Disposition: attachment).",
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
    description: `Até ${MAX_PERIOD_MONTHS} meses.`,
    security: secured,
    querystring: monthlyQuerySchema,
    response: { 200: monthlyResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
