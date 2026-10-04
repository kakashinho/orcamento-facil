import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  limitQuery,
  optionalText,
  responseId,
  responseTimestamp,
  secured,
} from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Administração"];

const logLevel = z.enum(["info", "warn", "error"]);

// ---------- Request DTOs ----------

export const setMaintenanceRequestSchema = z.strictObject({
  enabled: z.boolean(),
  message: optionalText(500)
    .nullable()
    .optional()
    .meta({ description: "Mensagem exibida ao usuário. Vazia ou omitida: mensagem padrão" }),
});
export type SetMaintenanceRequestDto = z.infer<typeof setMaintenanceRequestSchema>;

export const listLogsQuerySchema = z.strictObject({
  event: optionalText(80).optional().meta({ description: "Prefixo do evento, ex.: auth." }),
  level: logLevel.optional(),
  before: z.iso.datetime("Use data/hora ISO 8601 (ex.: 2026-10-04T12:00:00Z).").optional(),
  limit: limitQuery(200, 50),
});
export type ListLogsQueryDto = z.infer<typeof listLogsQuerySchema>;

// ---------- Response DTOs ----------

export const maintenanceStateResponseSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().nullable(),
    forced: z.boolean().meta({ description: "Ativado por variável de ambiente; não pode ser desligado pela API" }),
    updatedAt: responseTimestamp.nullable(),
  })
  .meta({ id: "MaintenanceState" });
export type MaintenanceStateResponseDto = z.infer<typeof maintenanceStateResponseSchema>;

export const appLogListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: responseId,
      level: z.string(),
      event: z.string(),
      message: z.string().nullable(),
      context: z.unknown(),
      userId: z.string().nullable(),
      requestId: z.string().nullable(),
      createdAt: responseTimestamp,
    }),
  ),
});
export type AppLogListResponseDto = z.infer<typeof appLogListResponseSchema>;

export const housekeepingResponseSchema = z.object({
  ranAt: responseTimestamp,
  results: z.array(z.object({ task: z.string(), removed: z.number(), failed: z.boolean() })),
});
export type HousekeepingResponseDto = z.infer<typeof housekeepingResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const adminRouteSchemas = {
  getMaintenance: {
    tags: TAGS,
    summary: "Estado do modo de manutenção (R72)",
    security: secured,
    response: { 200: maintenanceStateResponseSchema },
  },
  setMaintenance: {
    tags: TAGS,
    summary: "Ativar/desativar o modo de manutenção (R72)",
    description:
      "Com o modo ativo, operações que alteram dados retornam 503 MAINTENANCE_MODE com a mensagem configurada; consultas continuam disponíveis.",
    security: secured,
    body: setMaintenanceRequestSchema,
    response: { 200: maintenanceStateResponseSchema },
  },
  listLogs: {
    tags: TAGS,
    summary: "Eventos importantes e erros registrados (R85)",
    security: secured,
    querystring: listLogsQuerySchema,
    response: { 200: appLogListResponseSchema },
  },
  housekeeping: {
    tags: TAGS,
    summary: "Executar agora a limpeza de dados vencidos",
    description:
      "Remove sessões expiradas, links de recuperação vencidos, histórico além da retenção e logs antigos. Também roda automaticamente (HOUSEKEEPING_INTERVAL_MINUTES).",
    security: secured,
    response: { 200: housekeepingResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
