import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Tags"];

// ---------- Request DTOs ----------

export const tagNameRequestSchema = z.object({ name: z.string().min(1).max(40).meta({ example: "viagem" }) });
export type TagNameRequestDto = z.infer<typeof tagNameRequestSchema>;

// ---------- Response DTOs ----------

export const tagResponseSchema = z
  .object({ id: z.string(), name: z.string(), transactionCount: z.number() })
  .meta({ id: "Tag" });
export type TagResponseDto = z.infer<typeof tagResponseSchema>;

export const tagListResponseSchema = z.object({ data: z.array(tagResponseSchema) });
export type TagListResponseDto = z.infer<typeof tagListResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const tagRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar tags do usuário (R43)",
    security: secured,
    response: { 200: tagListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar tag",
    security: secured,
    body: tagNameRequestSchema,
    response: { 201: tagResponseSchema },
  },
  rename: {
    tags: TAGS,
    summary: "Renomear tag",
    security: secured,
    params: idParams,
    body: tagNameRequestSchema,
    response: { 200: tagResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir tag (as transações permanecem)",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
