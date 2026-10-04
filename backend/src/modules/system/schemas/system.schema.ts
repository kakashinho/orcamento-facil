import type { FastifySchema } from "fastify";
import { z } from "zod";

const TAGS = ["Sistema"];

// ---------- Response DTOs ----------

export const livenessResponseSchema = z.object({ status: z.literal("ok") });

export const readinessUpResponseSchema = z.object({ status: z.literal("ok"), database: z.literal("up") });
export const readinessDownResponseSchema = z.object({ status: z.literal("degraded"), database: z.literal("down") });

export const statusResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  time: z.string(),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().nullable() }),
});
export type StatusResponseDto = z.infer<typeof statusResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const systemRouteSchemas = {
  liveness: {
    tags: TAGS,
    summary: "Liveness: o processo está respondendo",
    response: { 200: livenessResponseSchema },
  },
  readiness: {
    tags: TAGS,
    summary: "Readiness: banco de dados acessível",
    response: { 200: readinessUpResponseSchema, 503: readinessDownResponseSchema },
  },
  status: {
    tags: TAGS,
    summary: "Status público da API — o app consulta para informar manutenção (R72)",
    response: { 200: statusResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
