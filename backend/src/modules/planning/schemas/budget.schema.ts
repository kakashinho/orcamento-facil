import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  idParams,
  isoDate,
  isoMonth,
  positiveAmount,
  responseDate,
  responseId,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { monthsBetween } from "../../../shared/utils/dates.js";
import { BUDGET_PERIODS } from "../types/budget.types.js";

const TAGS = ["Orçamentos"];

/** Histórico de orçamentos: até 12 meses por consulta (R23). */
export const MAX_HISTORY_MONTHS = 12;

const period = z
  .enum(BUDGET_PERIODS)
  .meta({ description: "monthly = limite do mês (R21); daily = limite de cada dia (R74)" });
const categoryInfo = z.object({ id: responseId, name: z.string(), predefined: z.boolean() });

// ---------- Request DTOs ----------

export const createBudgetRequestSchema = z.strictObject({
  categoryId: uuid().meta({ description: "Categoria de despesa (ou de receitas e despesas)" }),
  period,
  amount: positiveAmount.meta({ description: "Limite na moeda principal do usuário", example: 800 }),
});
export type CreateBudgetRequestDto = z.infer<typeof createBudgetRequestSchema>;

export const updateBudgetRequestSchema = z.strictObject({
  amount: positiveAmount.meta({ description: "Novo limite; vale do mês atual em diante", example: 900 }),
});
export type UpdateBudgetRequestDto = z.infer<typeof updateBudgetRequestSchema>;

export const listBudgetsQuerySchema = z.strictObject({
  month: isoMonth.optional().meta({ description: "Orçamentos em vigor no mês. Padrão: mês atual" }),
});
export type ListBudgetsQueryDto = z.infer<typeof listBudgetsQuerySchema>;

export const budgetStatusQuerySchema = z.strictObject({
  month: isoMonth.optional().meta({ description: "Mês dos limites mensais. Padrão: mês atual" }),
  date: isoDate.optional().meta({ description: "Dia dos limites diários. Padrão: hoje, no fuso do usuário" }),
});
export type BudgetStatusQueryDto = z.infer<typeof budgetStatusQuerySchema>;

export const budgetHistoryQuerySchema = z
  .strictObject({ fromMonth: isoMonth, toMonth: isoMonth })
  .superRefine((value, ctx) => {
    if (value.fromMonth > value.toMonth) {
      ctx.addIssue({ code: "custom", path: ["toMonth"], message: "O mês final deve ser igual ou posterior ao inicial." });
    } else if (monthsBetween(value.fromMonth, value.toMonth).length > MAX_HISTORY_MONTHS) {
      ctx.addIssue({ code: "custom", path: ["toMonth"], message: `O período máximo é de ${MAX_HISTORY_MONTHS} meses.` });
    }
  });
export type BudgetHistoryQueryDto = z.infer<typeof budgetHistoryQuerySchema>;

// ---------- Response DTOs ----------

export const budgetResponseSchema = z
  .object({
    id: responseId,
    category: categoryInfo,
    period,
    amount: z.number().meta({ description: "Limite" }),
    currency: z.string().meta({ description: "Moeda do limite (moeda principal na criação)" }),
    validFrom: z.string().meta({ description: "Mês AAAA-MM em que passa a valer" }),
    validTo: z.string().nullable().meta({ description: "Último mês de vigência; null = em vigor" }),
  })
  .meta({ id: "Budget" });
export type BudgetResponseDto = z.infer<typeof budgetResponseSchema>;

export const budgetListResponseSchema = z.object({ data: z.array(budgetResponseSchema) });
export type BudgetListResponseDto = z.infer<typeof budgetListResponseSchema>;

export const budgetStatusItemSchema = z
  .object({
    budgetId: responseId,
    category: categoryInfo,
    period,
    currency: z.string(),
    limit: z.number(),
    spent: z.number().nullable().meta({ description: "Despesas da categoria no período; null se faltar câmbio" }),
    remaining: z.number().nullable().meta({ description: "Limite − gasto (negativo quando estourou)" }),
    percent: z.number().nullable().meta({ description: "Gasto ÷ limite × 100, com 1 casa" }),
    state: z
      .enum(["ok", "warning", "exceeded"])
      .meta({ description: "warning = a partir de 80% do limite; exceeded = passou do limite" }),
  })
  .meta({ id: "BudgetStatus" });
export type BudgetStatusItemDto = z.infer<typeof budgetStatusItemSchema>;

export const budgetStatusResponseSchema = z.object({
  month: z.string(),
  date: responseDate,
  monthly: z.array(budgetStatusItemSchema).meta({ description: "Limites mensais em vigor no mês (R21, R45)" }),
  daily: z.array(budgetStatusItemSchema).meta({ description: "Limites diários: gasto do dia `date` (R74)" }),
});
export type BudgetStatusResponseDto = z.infer<typeof budgetStatusResponseSchema>;

export const budgetHistoryResponseSchema = z.object({
  fromMonth: z.string(),
  toMonth: z.string(),
  months: z.array(
    z.object({
      month: z.string(),
      items: z.array(budgetStatusItemSchema).meta({ description: "Cada limite mensal com o valor que valia neste mês" }),
    }),
  ),
});
export type BudgetHistoryResponseDto = z.infer<typeof budgetHistoryResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const budgetRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Orçamentos em vigor no mês (R21, R74)",
    security: secured,
    querystring: listBudgetsQuerySchema,
    response: { 200: budgetListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar orçamento mensal ou limite diário de uma categoria (R21, R74)",
    description:
      "Vale do mês atual em diante, até ser alterado ou encerrado. No máximo um orçamento em vigor por categoria e período (409 BUDGET_ALREADY_EXISTS); categoria só de receitas: 422 CATEGORY_NOT_EXPENSE.",
    security: secured,
    body: createBudgetRequestSchema,
    response: { 201: budgetResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Alterar o limite (vale do mês atual em diante)",
    description: "Os meses anteriores continuam com o limite antigo no histórico (R23).",
    security: secured,
    params: idParams,
    body: updateBudgetRequestSchema,
    response: { 200: budgetResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Encerrar o orçamento",
    description: "Deixa de valer a partir do mês atual; os meses anteriores ficam no histórico.",
    security: secured,
    params: idParams,
  },
  status: {
    tags: TAGS,
    summary: "Orçado × gasto do mês e de hoje (R21, R45, R74)",
    security: secured,
    querystring: budgetStatusQuerySchema,
    response: { 200: budgetStatusResponseSchema },
  },
  history: {
    tags: TAGS,
    summary: "Histórico de orçamentos mensais (R23)",
    description: `Para cada mês (até ${MAX_HISTORY_MONTHS}), o limite que estava em vigor e o gasto real.`,
    security: secured,
    querystring: budgetHistoryQuerySchema,
    response: { 200: budgetHistoryResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
