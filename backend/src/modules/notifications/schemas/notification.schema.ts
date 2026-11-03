import type { FastifySchema } from "fastify";
import { z } from "zod";
import { cursorQuery, idParams, limitQuery, responseId, responseTimestamp, secured } from "../../../infrastructure/http/common-schemas.js";
import { NOTIFICATION_KINDS } from "../types/notification.types.js";

const TAGS = ["Notificações"];

// ---------- Request DTOs ----------

export const listNotificationsQuerySchema = z.strictObject({
  unread: z.enum(["true", "false"]).default("false").meta({ description: "true = só as não lidas" }),
  limit: limitQuery(50, 20),
  cursor: cursorQuery.optional(),
});
export type ListNotificationsQueryDto = z.infer<typeof listNotificationsQuerySchema>;

export const updateNotificationSettingsRequestSchema = z
  .strictObject({
    dailyReminderEnabled: z.boolean().optional().meta({ description: "Lembrete de registrar as despesas do dia (R18)" }),
    dailyReminderHour: z
      .number()
      .int("Use um número inteiro.")
      .min(0, "Use uma hora entre 0 e 23.")
      .max(23, "Use uma hora entre 0 e 23.")
      .optional()
      .meta({ description: "Hora do lembrete diário, no fuso do usuário (padrão 20)" }),
    goalRemindersEnabled: z.boolean().optional().meta({ description: "Aviso de metas perto da data limite (R18)" }),
    billRemindersEnabled: z.boolean().optional().meta({ description: "Lembretes de contas no dia do vencimento (R34)" }),
    alertsPushEnabled: z.boolean().optional().meta({ description: "Alertas de orçamento, saldo e metas também por push" }),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Informe ao menos uma preferência." });
export type UpdateNotificationSettingsRequestDto = z.infer<typeof updateNotificationSettingsRequestSchema>;

// ---------- Response DTOs ----------

export const notificationResponseSchema = z
  .object({
    id: responseId,
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string(),
    body: z.string().meta({ description: "Sem valores em dinheiro: o detalhe fica na tela da entidade" }),
    entityType: z
      .enum(["budget", "reduction_goal", "savings_goal", "wallet", "transaction", "reminder"])
      .nullable()
      .meta({ description: "Para onde o app navega ao tocar no aviso" }),
    entityId: responseId.nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    readAt: responseTimestamp.nullable(),
    createdAt: responseTimestamp,
  })
  .meta({ id: "Notification" });
export type NotificationResponseDto = z.infer<typeof notificationResponseSchema>;

export const notificationPageResponseSchema = z.object({
  data: z.array(notificationResponseSchema),
  nextCursor: z.string().nullable().meta({ description: "Envie em ?cursor= para a próxima página; null = fim" }),
});
export type NotificationPageResponseDto = z.infer<typeof notificationPageResponseSchema>;

export const unreadCountResponseSchema = z.object({ count: z.number() });
export const readAllResponseSchema = z.object({ updated: z.number() });

export const notificationSettingsResponseSchema = z
  .object({
    dailyReminderEnabled: z.boolean(),
    dailyReminderHour: z.number(),
    goalRemindersEnabled: z.boolean(),
    billRemindersEnabled: z.boolean(),
    alertsPushEnabled: z.boolean(),
  })
  .meta({ id: "NotificationSettings" });
export type NotificationSettingsResponseDto = z.infer<typeof notificationSettingsResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const notificationRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Caixa de notificações (alertas e lembretes)",
    description: "Mais recentes primeiro, com rolagem infinita por cursor.",
    security: secured,
    querystring: listNotificationsQuerySchema,
    response: { 200: notificationPageResponseSchema },
  },
  unreadCount: {
    tags: TAGS,
    summary: "Quantidade de notificações não lidas (sino do app)",
    security: secured,
    response: { 200: unreadCountResponseSchema },
  },
  markRead: {
    tags: TAGS,
    summary: "Marcar notificação como lida",
    security: secured,
    params: idParams,
    response: { 200: notificationResponseSchema },
  },
  markAllRead: {
    tags: TAGS,
    summary: "Marcar todas como lidas",
    security: secured,
    response: { 200: readAllResponseSchema },
  },
  getSettings: {
    tags: TAGS,
    summary: "Preferências de aviso (R18, R34)",
    security: secured,
    response: { 200: notificationSettingsResponseSchema },
  },
  updateSettings: {
    tags: TAGS,
    summary: "Alterar preferências de aviso",
    security: secured,
    body: updateNotificationSettingsRequestSchema,
    response: { 200: notificationSettingsResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
