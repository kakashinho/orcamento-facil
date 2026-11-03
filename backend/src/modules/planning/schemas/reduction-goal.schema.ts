import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, isoMonth, responseId, secured, uuid } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Orçamentos"];

// ---------- Request DTOs ----------

export const createReductionGoalRequestSchema = z.strictObject({
  categoryId: uuid().meta({ description: "Categoria de despesa (ou de receitas e despesas)" }),
  percent: z
    .number()
    .int("Use um número inteiro.")
    .min(1, "O mínimo é 1%.")
    .max(90, "O máximo é 90%.")
    .meta({ description: "Quanto reduzir em relação à média dos 3 meses anteriores", example: 10 }),
});
export type CreateReductionGoalRequestDto = z.infer<typeof createReductionGoalRequestSchema>;

export const listReductionGoalsQuerySchema = z.strictObject({
  month: isoMonth.optional().meta({ description: "Mês do acompanhamento. Padrão: mês atual" }),
});
export type ListReductionGoalsQueryDto = z.infer<typeof listReductionGoalsQuerySchema>;

// ---------- Response DTOs ----------

export const reductionGoalResponseSchema = z
  .object({
    id: responseId,
    category: z.object({ id: responseId, name: z.string(), predefined: z.boolean() }),
    percent: z.number(),
    currency: z.string(),
    baseline: z.number().meta({ description: "Média mensal de gasto nos 3 meses anteriores ao início (congelada)" }),
    target: z.number().meta({ description: "Alvo do mês: base × (1 − percentual)" }),
    month: z.string().meta({ description: "Mês acompanhado" }),
    spent: z.number().nullable().meta({ description: "Gasto da categoria no mês; null se faltar câmbio" }),
    state: z.enum(["on_track", "exceeded"]).meta({ description: "exceeded = o gasto do mês passou do alvo" }),
    startMonth: z.string(),
    endMonth: z.string().nullable(),
  })
  .meta({ id: "ReductionGoal" });
export type ReductionGoalResponseDto = z.infer<typeof reductionGoalResponseSchema>;

export const reductionGoalListResponseSchema = z.object({ data: z.array(reductionGoalResponseSchema) });
export type ReductionGoalListResponseDto = z.infer<typeof reductionGoalListResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const reductionGoalRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Metas de redução de gastos e o acompanhamento do mês (R67)",
    security: secured,
    querystring: listReductionGoalsQuerySchema,
    response: { 200: reductionGoalListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar meta de redução numa categoria (R67)",
    description:
      "A base é a média mensal de gasto da categoria nos 3 meses anteriores, calculada uma vez. Sem gasto anterior: 422 NO_BASELINE; já existe meta ativa na categoria: 409 REDUCTION_GOAL_EXISTS.",
    security: secured,
    body: createReductionGoalRequestSchema,
    response: { 201: reductionGoalResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Encerrar a meta de redução",
    description: "Deixa de valer a partir do mês atual; os meses anteriores são preservados.",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
