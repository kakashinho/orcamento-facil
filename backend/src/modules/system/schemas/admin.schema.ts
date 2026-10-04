import type { FastifySchema } from "fastify";
import { z } from "zod";
import { secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Administração"];

// ---------- Request DTOs ----------

export const setMaintenanceRequestSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).nullable().optional(),
});
export type SetMaintenanceRequestDto = z.infer<typeof setMaintenanceRequestSchema>;

export const listLogsQuerySchema = z.object({
  event: z.string().max(80).optional().meta({ description: "Prefixo do evento, ex.: auth." }),
  level: z.enum(["info", "warn", "error"]).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListLogsQueryDto = z.infer<typeof listLogsQuerySchema>;

// ---------- Response DTOs ----------

export const maintenanceStateResponseSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().nullable(),
    forced: z.boolean(),
    updatedAt: z.string().nullable(),
  })
  .meta({ id: "MaintenanceState" });
export type MaintenanceStateResponseDto = z.infer<typeof maintenanceStateResponseSchema>;

export const appLogListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      level: z.string(),
      event: z.string(),
      message: z.string().nullable(),
      context: z.unknown(),
      userId: z.string().nullable(),
      requestId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type AppLogListResponseDto = z.infer<typeof appLogListResponseSchema>;

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
} satisfies Record<string, FastifySchema>;
