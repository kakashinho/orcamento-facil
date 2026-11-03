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
import { REMINDER_FREQUENCIES } from "../types/reminder.types.js";

const TAGS = ["Lembretes"];

const title = requiredText(80, "Informe o título do lembrete.").meta({ example: "Aluguel" });
const frequency = z.enum(REMINDER_FREQUENCIES).meta({ description: "weekly = semanal; monthly = mensal; yearly = anual" });
const amount = positiveAmount.meta({ description: "Valor da conta (opcional, só para consulta)", example: 1500 });

// ---------- Request DTOs ----------

export const createReminderRequestSchema = z
  .strictObject({
    title: title.optional(),
    nextDueDate: isoDate.optional().meta({ description: "Próximo vencimento" }),
    frequency: frequency.optional(),
    amount: amount.optional(),
    seriesId: uuid()
      .optional()
      .meta({ description: "Despesa recorrente de origem (R37): título, data e frequência vêm dela quando omitidos" }),
  })
  .superRefine((body, ctx) => {
    if (body.seriesId) return;
    if (body.title === undefined) ctx.addIssue({ code: "custom", path: ["title"], message: "Informe o título do lembrete." });
    if (body.nextDueDate === undefined) ctx.addIssue({ code: "custom", path: ["nextDueDate"], message: "Campo obrigatório." });
    if (body.frequency === undefined) ctx.addIssue({ code: "custom", path: ["frequency"], message: "Campo obrigatório." });
  });
export type CreateReminderRequestDto = z.infer<typeof createReminderRequestSchema>;

export const updateReminderRequestSchema = z
  .strictObject({
    title: title.optional(),
    nextDueDate: isoDate.optional(),
    frequency: frequency.optional(),
    amount: amount.nullable().optional().meta({ description: "null remove o valor" }),
    active: z.boolean().optional().meta({ description: "false pausa o lembrete" }),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Informe ao menos um campo." });
export type UpdateReminderRequestDto = z.infer<typeof updateReminderRequestSchema>;

// ---------- Response DTOs ----------

export const reminderResponseSchema = z
  .object({
    id: responseId,
    title: z.string(),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    frequency,
    nextDueDate: responseDate,
    seriesId: responseId.nullable(),
    active: z.boolean(),
    lastNotifiedOn: responseDate.nullable(),
    createdAt: responseTimestamp,
  })
  .meta({ id: "Reminder" });
export type ReminderResponseDto = z.infer<typeof reminderResponseSchema>;

export const reminderListResponseSchema = z.object({ data: z.array(reminderResponseSchema) });
export type ReminderListResponseDto = z.infer<typeof reminderListResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const reminderRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Lembretes de contas fixas (R34)",
    security: secured,
    response: { 200: reminderListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar lembrete de conta fixa (R34)",
    description:
      "No dia do vencimento, às 9h no fuso do usuário, chega um aviso (caixa e push); depois o vencimento avança pela frequência. Com `seriesId`, nasce de uma despesa recorrente.",
    security: secured,
    body: createReminderRequestSchema,
    response: { 201: reminderResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Alterar, pausar ou reativar o lembrete",
    security: secured,
    params: idParams,
    body: updateReminderRequestSchema,
    response: { 200: reminderResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir o lembrete",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
