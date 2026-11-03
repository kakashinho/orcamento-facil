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
import { daysBetween, monthOf, monthsBetween } from "../../../shared/utils/dates.js";
import { transactionResponseSchema, transactionSummaryResponseSchema } from "../../finance/schemas/transaction.schema.js";
import { walletSummaryResponseSchema } from "../../finance/schemas/wallet.schema.js";

const TAGS = ["Relatórios"];

const kind = z
  .enum(["income", "expense", "transfer_in", "transfer_out"])
  .meta({ description: "income/expense = transação; transfer_in/transfer_out = transferência entre carteiras" });
const categoryInfo = z.object({ id: responseId, name: z.string() }).nullable();
const categoryType = z.enum(["income", "expense"]);
const granularity = z
  .enum(["day", "month"])
  .meta({ description: "day = saldo de fim de cada dia (até 92 dias); month = saldo de fim de cada mês (até 36 meses)" });

/** Evolução diária: até 92 pontos. */
export const MAX_EVOLUTION_DAYS = 92;

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
    includeHidden: z
      .enum(["true", "false"])
      .default("false")
      .meta({ description: "true = inclui as categorias que o usuário ocultou dos relatórios (R46)" }),
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

export const balanceEvolutionQuerySchema = z
  .strictObject({
    from: isoDate.meta({ description: "Data inicial (inclusive)" }),
    to: isoDate.meta({ description: "Data final (inclusive)" }),
    walletId: uuid().optional().meta({ description: "Sem carteira: saldo de todas, convertido para a moeda principal" }),
    granularity: granularity.default("day"),
  })
  .superRefine((value, ctx) => {
    if (value.from > value.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "A data final deve ser igual ou posterior à inicial." });
    } else if (value.granularity === "day" && daysBetween(value.from, value.to) + 1 > MAX_EVOLUTION_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Com granularidade diária, o período máximo é de ${MAX_EVOLUTION_DAYS} dias.`,
      });
    } else if (
      value.granularity === "month" &&
      monthsBetween(monthOf(value.from), monthOf(value.to)).length > MAX_PERIOD_MONTHS
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Com granularidade mensal, o período máximo é de ${MAX_PERIOD_MONTHS} meses.`,
      });
    }
  });
export type BalanceEvolutionQueryDto = z.infer<typeof balanceEvolutionQuerySchema>;

export const monthIndicatorsQuerySchema = z.strictObject({
  month: isoMonth.optional().meta({ description: "Mês dos indicadores. Padrão: mês atual no fuso do usuário" }),
});
export type MonthIndicatorsQueryDto = z.infer<typeof monthIndicatorsQuerySchema>;

export const projectionQuerySchema = z.strictObject({
  months: z.coerce
    .number()
    .int("Use um número inteiro.")
    .min(3, "O mínimo é 3 meses.")
    .max(24, "O máximo é 24 meses.")
    .default(6)
    .meta({ description: "Meses projetados, a partir do atual (3 a 24, padrão 6)" }),
});
export type ProjectionQueryDto = z.infer<typeof projectionQuerySchema>;

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
  convertedTotal: z.number().nullable().meta({ description: "Total das categorias exibidas" }),
  categories: z.array(categoryTotalsSchema),
  hidden: z
    .object({
      count: z.number().meta({ description: "Categorias ocultas com movimento no período" }),
      convertedTotal: z.number().nullable().meta({ description: "Total delas na moeda principal" }),
    })
    .meta({ description: "O que ficou de fora por estar oculto (R46)" }),
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
    unreadNotifications: z.number().meta({ description: "Notificações não lidas (sino do app)" }),
  })
  .meta({ id: "Overview" });
export type OverviewResponseDto = z.infer<typeof overviewResponseSchema>;

export const balanceEvolutionResponseSchema = z
  .object({
    from: responseDate,
    to: responseDate,
    granularity,
    currency: z.string().meta({ description: "Moeda dos saldos: a da carteira ou a principal (consolidado)" }),
    walletId: responseId.nullable(),
    points: z.array(
      z.object({
        date: responseDate.meta({ description: "Dia (ou último dia do mês) a que o saldo se refere" }),
        balance: z.number().nullable().meta({ description: "Saldo de fim do dia; null se faltar câmbio" }),
      }),
    ),
    ratesStale: z.boolean().meta({ description: "true = alguma conversão usou cotação vencida (cache)" }),
  })
  .meta({ id: "BalanceEvolution" });
export type BalanceEvolutionResponseDto = z.infer<typeof balanceEvolutionResponseSchema>;

export const monthIndicatorsResponseSchema = z
  .object({
    month: z.string(),
    currency: z.string().meta({ description: "Moeda principal do usuário" }),
    days: z.number().meta({ description: "Dias considerados no saldo médio (mês atual: até hoje)" }),
    averageDailyBalance: z
      .number()
      .nullable()
      .meta({ description: "R35: média dos saldos de fim de dia, contando dias sem movimento; null se faltar câmbio" }),
    ratesStale: z.boolean(),
    savings: z
      .object({
        saved: z.number().nullable().meta({ description: "R75: receitas − despesas do mês" }),
        previousAverage: z
          .number()
          .nullable()
          .meta({ description: "Média do saldo dos meses anteriores com movimento; null sem meses para comparar" }),
        previousMonths: z.array(z.string()).meta({ description: "Até 3 meses anteriores usados na média" }),
        difference: z.number().nullable(),
        differencePercent: z.number().nullable(),
      })
      .meta({ description: "Valor economizado no mês comparado à média dos meses anteriores (R75)" }),
    topExpenses: z
      .array(
        z.object({
          transaction: transactionResponseSchema,
          convertedAmount: z.number().nullable().meta({ description: "Valor na moeda principal; null se faltar câmbio" }),
        }),
      )
      .meta({ description: "R36: as 10 maiores despesas do mês, pelo valor na moeda principal (inclui arquivadas)" }),
  })
  .meta({ id: "MonthIndicators" });
export type MonthIndicatorsResponseDto = z.infer<typeof monthIndicatorsResponseSchema>;

export const projectionResponseSchema = z
  .object({
    currency: z.string().meta({ description: "Moeda principal" }),
    startBalance: z.number().nullable().meta({ description: "Saldo total atual; null se faltar câmbio" }),
    ratesStale: z.boolean(),
    months: z.array(
      z.object({
        month: z.string(),
        openingBalance: z.number().nullable(),
        expectedIncome: z.number().nullable(),
        expectedExpense: z.number().nullable(),
        closingBalance: z.number().nullable(),
        items: z.array(
          z.object({
            seriesId: responseId,
            description: z.string(),
            kind: z.enum(["recurring", "installment"]),
            type: z.enum(["income", "expense"]),
            date: responseDate,
            amount: z.number().nullable().meta({ description: "Na moeda principal; null se faltar câmbio" }),
          }),
        ),
      }),
    ),
  })
  .meta({ id: "Projection" });
export type ProjectionResponseDto = z.infer<typeof projectionResponseSchema>;

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
  balanceEvolution: {
    tags: TAGS,
    summary: "Evolução do saldo ao longo do tempo (R14)",
    description:
      "Saldo de fim de dia (até 92 dias) ou de fim de mês (até 36 meses). Sem `walletId`, soma todas as carteiras convertidas para a moeda principal; dia sem movimento repete o saldo anterior.",
    security: secured,
    querystring: balanceEvolutionQuerySchema,
    response: { 200: balanceEvolutionResponseSchema },
  },
  projection: {
    tags: TAGS,
    summary: "Saldo projetado dos próximos meses (R63)",
    description:
      "Parte do saldo total atual e soma as receitas e despesas fixas ainda não registradas: as próximas ocorrências das recorrências e as parcelas restantes.",
    security: secured,
    querystring: projectionQuerySchema,
    response: { 200: projectionResponseSchema },
  },
  monthIndicators: {
    tags: TAGS,
    summary: "Indicadores do mês: saldo médio diário (R35), valor economizado (R75) e maiores despesas (R36)",
    description: "Tudo em uma requisição, na moeda principal. Mês futuro: 422 MONTH_IN_FUTURE.",
    security: secured,
    querystring: monthIndicatorsQuerySchema,
    response: { 200: monthIndicatorsResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
