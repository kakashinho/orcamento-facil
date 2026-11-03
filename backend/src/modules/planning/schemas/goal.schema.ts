import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  idParams,
  isoDate,
  positiveAmount,
  requiredText,
  responseDate,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { GOAL_STATUSES } from "../types/goal.types.js";

const TAGS = ["Metas"];

const goalName = requiredText(80, "Informe o nome da meta.").meta({ example: "Viagem para o Nordeste" });
const categoryInfo = z.object({ id: responseId, name: z.string(), predefined: z.boolean() });

// ---------- Request DTOs ----------

export const createGoalRequestSchema = z.strictObject({
  name: goalName,
  targetAmount: positiveAmount.meta({ description: "Valor alvo, na moeda principal", example: 5000 }),
  deadline: isoDate.meta({ description: "Data limite (hoje ou depois)" }),
  categoryId: uuid().meta({ description: "Categoria associada (ex.: uma categoria 'Viagem' criada pelo usuário)" }),
});
export type CreateGoalRequestDto = z.infer<typeof createGoalRequestSchema>;

export const updateGoalRequestSchema = z
  .strictObject({
    name: goalName.optional(),
    targetAmount: positiveAmount.optional(),
    deadline: isoDate.optional(),
    categoryId: uuid().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Informe ao menos um campo." });
export type UpdateGoalRequestDto = z.infer<typeof updateGoalRequestSchema>;

export const listGoalsQuerySchema = z.strictObject({
  status: z
    .enum([...GOAL_STATUSES, "all"])
    .default("active")
    .meta({ description: "active (padrão), achieved, cancelled ou all" }),
});
export type ListGoalsQueryDto = z.infer<typeof listGoalsQuerySchema>;

export const createContributionRequestSchema = z.strictObject({
  transactionId: uuid().meta({ description: "Receita a destinar (o dinheiro continua na carteira)" }),
  amount: positiveAmount
    .optional()
    .meta({ description: "Parte da receita, na moeda dela. Padrão: o que ainda não foi destinado a outras metas" }),
});
export type CreateContributionRequestDto = z.infer<typeof createContributionRequestSchema>;

export const contributionParams = z.strictObject({ id: uuid(), contributionId: uuid() });

export const contributionsByTransactionQuerySchema = z.strictObject({ transactionId: uuid() });

// ---------- Response DTOs ----------

export const goalResponseSchema = z
  .object({
    id: responseId,
    name: z.string(),
    category: categoryInfo,
    targetAmount: z.number(),
    currency: z.string().meta({ description: "Moeda da meta (moeda principal na criação)" }),
    deadline: responseDate,
    status: z.enum(GOAL_STATUSES),
    achievedAt: responseTimestamp.nullable(),
    saved: z.number().nullable().meta({ description: "Acumulado (R16); null se faltar câmbio" }),
    percent: z.number().nullable().meta({ description: "Acumulado ÷ alvo × 100 (pode passar de 100)" }),
    remaining: z.number().nullable().meta({ description: "Quanto falta (0 quando atingida)" }),
    daysLeft: z.number().meta({ description: "Dias até a data limite (0 no dia ou depois)" }),
  })
  .meta({ id: "Goal" });
export type GoalResponseDto = z.infer<typeof goalResponseSchema>;

export const goalListResponseSchema = z.object({ data: z.array(goalResponseSchema) });
export type GoalListResponseDto = z.infer<typeof goalListResponseSchema>;

export const goalDetailResponseSchema = goalResponseSchema
  .extend({
    contributions: z.array(
      z.object({
        id: responseId,
        transaction: z.object({
          id: responseId,
          date: responseDate,
          description: z.string(),
          amount: z.number(),
          currency: z.string(),
        }),
        amount: z.number().meta({ description: "Valor destinado, na moeda da receita" }),
        counted: z.number().meta({ description: "Quanto conta hoje (0 se a receita foi excluída ou virou despesa)" }),
      }),
    ),
  })
  .meta({ id: "GoalDetail" });
export type GoalDetailResponseDto = z.infer<typeof goalDetailResponseSchema>;

export const contributionResponseSchema = z.object({
  id: responseId,
  goalId: responseId,
  transactionId: responseId,
  amount: z.number(),
  currency: z.string(),
  createdAt: responseTimestamp,
});
export type ContributionResponseDto = z.infer<typeof contributionResponseSchema>;

export const createContributionResponseSchema = z.object({
  contribution: contributionResponseSchema,
  goal: goalResponseSchema,
  achievedNow: z.boolean().meta({ description: "true = este vínculo completou a meta (o app celebra — R68)" }),
});
export type CreateContributionResponseDto = z.infer<typeof createContributionResponseSchema>;

export const contributionsByTransactionResponseSchema = z.object({
  data: z.array(z.object({ id: responseId, goal: z.object({ id: responseId, name: z.string() }), amount: z.number() })),
});
export type ContributionsByTransactionResponseDto = z.infer<typeof contributionsByTransactionResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const goalRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Metas de economia com progresso (R15, R16)",
    security: secured,
    querystring: listGoalsQuerySchema,
    response: { 200: goalListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar meta de economia (R15)",
    description: "Data limite no passado: 422 INVALID_DEADLINE. Categoria só de receitas: 422 CATEGORY_TYPE_MISMATCH.",
    security: secured,
    body: createGoalRequestSchema,
    response: { 201: goalResponseSchema },
  },
  get: {
    tags: TAGS,
    summary: "Detalhe da meta com as receitas vinculadas",
    security: secured,
    params: idParams,
    response: { 200: goalDetailResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Alterar nome, alvo, data limite ou categoria",
    description: "Meta cancelada: 409 GOAL_NOT_ACTIVE.",
    security: secured,
    params: idParams,
    body: updateGoalRequestSchema,
    response: { 200: goalResponseSchema },
  },
  cancel: {
    tags: TAGS,
    summary: "Cancelar a meta",
    description: "Sai da lista de ativas; os vínculos são preservados.",
    security: secured,
    params: idParams,
  },
  addContribution: {
    tags: TAGS,
    summary: "Destinar uma receita (toda ou parte) à meta (R17)",
    description:
      "A soma dos vínculos de uma receita não pode passar do valor dela (422 CONTRIBUTION_EXCEEDS_TRANSACTION). Só receitas (422 CONTRIBUTION_NOT_INCOME); a mesma receita uma vez por meta (409 CONTRIBUTION_EXISTS).",
    security: secured,
    params: idParams,
    body: createContributionRequestSchema,
    response: { 201: createContributionResponseSchema },
  },
  removeContribution: {
    tags: TAGS,
    summary: "Desfazer o vínculo de uma receita com a meta",
    security: secured,
    params: contributionParams,
  },
  contributionsByTransaction: {
    tags: TAGS,
    summary: "Metas para as quais uma receita foi destinada",
    security: secured,
    querystring: contributionsByTransactionQuerySchema,
    response: { 200: contributionsByTransactionResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
