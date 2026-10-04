import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, requiredText, responseId, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Tags"];

/** Nome de tag: espaços repetidos viram um só no service ("  Viagem   SP " → "Viagem SP"). */
export const tagName = requiredText(40, "Informe o nome da tag.").meta({ example: "viagem" });

// ---------- Request DTOs ----------

export const tagNameRequestSchema = z.strictObject({ name: tagName });
export type TagNameRequestDto = z.infer<typeof tagNameRequestSchema>;

// ---------- Response DTOs ----------

export const tagResponseSchema = z
  .object({
    id: responseId,
    name: z.string(),
    transactionCount: z.number().meta({ description: "Transações ativas com a tag" }),
  })
  .meta({ id: "Tag" });
export type TagResponseDto = z.infer<typeof tagResponseSchema>;

export const tagListResponseSchema = z.object({ data: z.array(tagResponseSchema) });
export type TagListResponseDto = z.infer<typeof tagListResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const tagRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar tags do usuário (R43)",
    description: "Em ordem alfabética, com a quantidade de transações de cada tag.",
    security: secured,
    response: { 200: tagListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar tag",
    description: "Tags também são criadas automaticamente ao registrar uma transação com `tags`.",
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
    summary: "Excluir tag (as transações permanecem, só perdem a tag)",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
