import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  idParams,
  isoDate,
  optionalText,
  positiveAmount,
  requiredText,
  responseDate,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { SERIES_FREQUENCIES, SERIES_KINDS, SERIES_STATUSES } from "../types/series.types.js";
import { tagName } from "./tag.schema.js";
import { createTransactionRequestSchema, transactionResponseSchema } from "./transaction.schema.js";

const TAGS = ["Recorrências e parcelamentos"];

const frequency = z.enum(SERIES_FREQUENCIES).meta({ description: "weekly = semanal; monthly = mensal; yearly = anual" });
const endDate = isoDate.meta({ description: "Última data possível de uma ocorrência (opcional)" });

// ---------- Request DTOs ----------

export const createRecurringRequestSchema = createTransactionRequestSchema.extend({
  frequency,
  endDate: endDate.optional(),
});
export type CreateRecurringRequestDto = z.infer<typeof createRecurringRequestSchema>;

export const markRecurringRequestSchema = z.strictObject({ frequency, endDate: endDate.optional() });
export type MarkRecurringRequestDto = z.infer<typeof markRecurringRequestSchema>;

export const markRecurringParams = z.strictObject({ transactionId: uuid() });

export const createInstallmentsRequestSchema = z.strictObject({
  totalAmount: positiveAmount.meta({ description: "Valor total da compra; o sistema divide (a sobra vai na 1ª)", example: 1200 }),
  installments: z
    .number()
    .int("Use um número inteiro.")
    .min(2, "O mínimo é 2 parcelas.")
    .max(72, "O máximo é 72 parcelas.")
    .meta({ description: "Número de parcelas mensais", example: 10 }),
  date: isoDate.meta({ description: "Data da 1ª parcela (entre 1 ano atrás e 1 ano à frente)" }),
  description: requiredText(200, "Informe a descrição.").meta({ example: "Notebook" }),
  walletId: uuid().optional().meta({ description: "Padrão: carteira padrão do usuário" }),
  categoryId: uuid().nullable().optional(),
  tags: z.array(tagName).max(10, "Use no máximo 10 tags.").optional(),
  notes: optionalText(1000).nullable().optional().meta({ description: "Nota da 1ª parcela (R57)" }),
});
export type CreateInstallmentsRequestDto = z.infer<typeof createInstallmentsRequestSchema>;

export const listSeriesQuerySchema = z.strictObject({
  status: z.enum([...SERIES_STATUSES, "all"]).default("active").meta({ description: "active (padrão), ended, cancelled ou all" }),
});
export type ListSeriesQueryDto = z.infer<typeof listSeriesQuerySchema>;

export const updateSeriesRequestSchema = z
  .strictObject({
    amount: positiveAmount.optional().meta({ description: "Só recorrências: novo valor das próximas ocorrências" }),
    description: requiredText(200, "Informe a descrição.").optional(),
    categoryId: uuid().nullable().optional(),
    walletId: uuid().optional(),
    endDate: endDate.nullable().optional().meta({ description: "Só recorrências; null remove a data final" }),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Informe ao menos um campo." });
export type UpdateSeriesRequestDto = z.infer<typeof updateSeriesRequestSchema>;

// ---------- Response DTOs ----------

export const seriesResponseSchema = z
  .object({
    id: responseId,
    kind: z.enum(SERIES_KINDS),
    type: z.enum(["income", "expense"]),
    frequency,
    description: z.string(),
    wallet: z.object({ id: responseId, name: z.string(), currency: z.string() }),
    category: z.object({ id: responseId, name: z.string() }).nullable(),
    amount: z.number().meta({ description: "Valor de cada ocorrência (no parcelamento, o das parcelas depois da 1ª)" }),
    totalAmount: z.number().nullable().meta({ description: "Parcelamento: valor total" }),
    installments: z.number().nullable(),
    startDate: responseDate,
    endDate: responseDate.nullable(),
    nextDate: responseDate.nullable().meta({ description: "Próxima ocorrência (gerada automaticamente na data)" }),
    generatedCount: z.number(),
    remaining: z.number().nullable().meta({ description: "Parcelamento: parcelas que faltam" }),
    status: z.enum(SERIES_STATUSES),
    createdAt: responseTimestamp,
  })
  .meta({ id: "Series" });
export type SeriesResponseDto = z.infer<typeof seriesResponseSchema>;

export const seriesListResponseSchema = z.object({ data: z.array(seriesResponseSchema) });
export type SeriesListResponseDto = z.infer<typeof seriesListResponseSchema>;

export const seriesDetailResponseSchema = seriesResponseSchema
  .extend({
    occurrences: z.array(
      z.object({ occurrence: z.number(), transactionId: responseId, date: responseDate, amount: z.number() }),
    ),
  })
  .meta({ id: "SeriesDetail" });
export type SeriesDetailResponseDto = z.infer<typeof seriesDetailResponseSchema>;

export const createSeriesResponseSchema = z.object({
  series: seriesResponseSchema,
  transactions: z.array(transactionResponseSchema).meta({ description: "Ocorrências já vencidas, criadas agora" }),
});
export type CreateSeriesResponseDto = z.infer<typeof createSeriesResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const seriesRouteSchemas = {
  createRecurring: {
    tags: TAGS,
    summary: "Registrar transação recorrente (R37)",
    description:
      "Grava a 1ª ocorrência (se a data já chegou) e o plano. As próximas viram transação no dia de cada uma, no fuso do usuário — nada entra no saldo antes da data.",
    security: secured,
    body: createRecurringRequestSchema,
    response: { 201: createSeriesResponseSchema },
  },
  markRecurring: {
    tags: TAGS,
    summary: "Marcar uma transação existente como recorrente (R37)",
    description:
      "A transação vira a 1ª ocorrência; as já vencidas depois dela são geradas na hora (até 12). Transação com mais de 12 meses: 422 TRANSACTION_TOO_OLD; já em série: 409.",
    security: secured,
    params: markRecurringParams,
    body: markRecurringRequestSchema,
    response: { 201: createSeriesResponseSchema },
  },
  createInstallments: {
    tags: TAGS,
    summary: "Registrar despesa parcelada (R62)",
    description: "Divide o total em parcelas mensais (a sobra dos centavos fica na 1ª). Cada parcela entra no saldo na data dela.",
    security: secured,
    body: createInstallmentsRequestSchema,
    response: { 201: createSeriesResponseSchema },
  },
  list: {
    tags: TAGS,
    summary: "Recorrências e parcelamentos",
    security: secured,
    querystring: listSeriesQuerySchema,
    response: { 200: seriesListResponseSchema },
  },
  get: {
    tags: TAGS,
    summary: "Detalhe da série com as ocorrências já geradas",
    security: secured,
    params: idParams,
    response: { 200: seriesDetailResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Alterar as próximas ocorrências",
    description: "As transações já geradas não mudam. Série encerrada ou cancelada: 409 SERIES_NOT_ACTIVE.",
    security: secured,
    params: idParams,
    body: updateSeriesRequestSchema,
    response: { 200: seriesResponseSchema },
  },
  cancel: {
    tags: TAGS,
    summary: "Cancelar a série",
    description: "As próximas ocorrências não são mais geradas; as já registradas continuam.",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
