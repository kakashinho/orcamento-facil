import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Categorias"];

// ---------- Request DTOs ----------

export const categoryNameRequestSchema = z.object({ name: z.string().min(1).max(60).meta({ example: "Pets" }) });
export type CategoryNameRequestDto = z.infer<typeof categoryNameRequestSchema>;

export const suggestCategoryRequestSchema = z.object({
  description: z.string().min(1).max(200).meta({ example: "Almoço no restaurante" }),
});
export type SuggestCategoryRequestDto = z.infer<typeof suggestCategoryRequestSchema>;

// ---------- Response DTOs ----------

export const categoryResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    predefined: z.boolean(),
    systemKey: z.string().nullable(),
  })
  .meta({ id: "Category" });
export type CategoryResponseDto = z.infer<typeof categoryResponseSchema>;

export const categoryListResponseSchema = z.object({ data: z.array(categoryResponseSchema) });
export type CategoryListResponseDto = z.infer<typeof categoryListResponseSchema>;

export const categorySuggestionsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      categoryId: z.string(),
      name: z.string(),
      confidence: z.number().meta({ description: "0 a 1" }),
      reasons: z.array(z.string()),
    }),
  ),
});
export type CategorySuggestionsResponseDto = z.infer<typeof categorySuggestionsResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const categoryRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar categorias predefinidas (R07) e personalizadas (R08)",
    security: secured,
    response: { 200: categoryListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar categoria personalizada (R08)",
    security: secured,
    body: categoryNameRequestSchema,
    response: { 201: categoryResponseSchema },
  },
  suggest: {
    tags: TAGS,
    summary: "Sugerir categoria a partir da descrição (R44)",
    description:
      "Correspondência de palavras-chave com as categorias predefinidas, nomes das categorias do usuário e o histórico de categorização dele.",
    security: secured,
    body: suggestCategoryRequestSchema,
    response: { 200: categorySuggestionsResponseSchema },
  },
  rename: {
    tags: TAGS,
    summary: "Renomear categoria personalizada",
    security: secured,
    params: idParams,
    body: categoryNameRequestSchema,
    response: { 200: categoryResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir categoria personalizada",
    description: "Transações já registradas mantêm a categoria; ela deixa de aparecer para novos registros.",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
