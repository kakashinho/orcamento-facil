import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, requiredText, responseId, secured } from "../../../infrastructure/http/common-schemas.js";
import { CATEGORY_TYPES } from "../types/category.types.js";

const TAGS = ["Categorias"];

const categoryName = requiredText(60, "Informe o nome da categoria.").meta({ example: "Pets" });
const categoryType = z
  .enum(CATEGORY_TYPES)
  .meta({ description: "income = só receitas; expense = só despesas; null = receitas e despesas" });

// ---------- Request DTOs ----------

export const listCategoriesQuerySchema = z.strictObject({
  type: z
    .enum(CATEGORY_TYPES)
    .optional()
    .meta({ description: "Somente categorias que aceitam este tipo de transação (para o formulário)" }),
});
export type ListCategoriesQueryDto = z.infer<typeof listCategoriesQuerySchema>;

export const createCategoryRequestSchema = z.strictObject({
  name: categoryName,
  type: categoryType.nullable().optional().meta({ description: "Omitido ou null: vale para receitas e despesas" }),
});
export type CreateCategoryRequestDto = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z
  .strictObject({ name: categoryName.optional(), type: categoryType.nullable().optional() })
  .refine((body) => body.name !== undefined || body.type !== undefined, {
    message: "Informe o nome ou o tipo da categoria.",
  });
export type UpdateCategoryRequestDto = z.infer<typeof updateCategoryRequestSchema>;

export const suggestCategoryRequestSchema = z.strictObject({
  description: requiredText(200, "Informe a descrição.").meta({ example: "Almoço no restaurante" }),
  type: z
    .enum(CATEGORY_TYPES)
    .optional()
    .meta({ description: "Tipo da transação: sugere só categorias compatíveis" }),
});
export type SuggestCategoryRequestDto = z.infer<typeof suggestCategoryRequestSchema>;

// ---------- Response DTOs ----------

export const categoryResponseSchema = z
  .object({
    id: responseId,
    name: z.string(),
    type: categoryType.nullable(),
    predefined: z.boolean().meta({ description: "true = categoria do sistema (R07), não pode ser alterada" }),
    systemKey: z.string().nullable(),
  })
  .meta({ id: "Category" });
export type CategoryResponseDto = z.infer<typeof categoryResponseSchema>;

export const categoryListResponseSchema = z.object({ data: z.array(categoryResponseSchema) });
export type CategoryListResponseDto = z.infer<typeof categoryListResponseSchema>;

export const categorySuggestionsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      categoryId: responseId,
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
    description: "Predefinidas primeiro, depois por nome. Use `type` para o seletor do formulário de receita ou despesa.",
    security: secured,
    querystring: listCategoriesQuerySchema,
    response: { 200: categoryListResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar categoria personalizada (R08)",
    security: secured,
    body: createCategoryRequestSchema,
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
  update: {
    tags: TAGS,
    summary: "Renomear ou mudar o tipo de uma categoria personalizada",
    description:
      "Restringir o tipo exige que nenhuma transação do outro tipo use a categoria (409 CATEGORY_TYPE_IN_USE). Predefinidas: 403.",
    security: secured,
    params: idParams,
    body: updateCategoryRequestSchema,
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
