import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { idParams, secured } from "../../http/schemas.js";

const categoryResponse = z
  .object({
    id: z.string(),
    name: z.string(),
    predefined: z.boolean(),
    systemKey: z.string().nullable(),
  })
  .meta({ id: "Category" });

const categoryName = z.string().min(1).max(60).meta({ example: "Pets" });

export function categoryRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { categories } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Categorias"],
          summary: "Listar categorias predefinidas (R07) e personalizadas (R08)",
          security: secured,
          response: { 200: z.object({ data: z.array(categoryResponse) }) },
        },
      },
      async (request) => ({ data: await categories.list(requireAuth(request).userId) }),
    );

    app.post(
      "/",
      {
        schema: {
          tags: ["Categorias"],
          summary: "Criar categoria personalizada (R08)",
          security: secured,
          body: z.object({ name: categoryName }),
          response: { 201: categoryResponse },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await categories.create(requireAuth(request).userId, request.body.name)),
    );

    app.post(
      "/suggest",
      {
        schema: {
          tags: ["Categorias"],
          summary: "Sugerir categoria a partir da descrição (R44)",
          description:
            "Correspondência de palavras-chave com as categorias predefinidas, nomes das categorias do usuário e o histórico de categorização dele.",
          security: secured,
          body: z.object({ description: z.string().min(1).max(200).meta({ example: "Almoço no restaurante" }) }),
          response: {
            200: z.object({
              suggestions: z.array(
                z.object({
                  categoryId: z.string(),
                  name: z.string(),
                  confidence: z.number().meta({ description: "0 a 1" }),
                  reasons: z.array(z.string()),
                }),
              ),
            }),
          },
        },
      },
      async (request) => ({
        suggestions: await categories.suggest(requireAuth(request).userId, request.body.description),
      }),
    );

    app.patch(
      "/:id",
      {
        schema: {
          tags: ["Categorias"],
          summary: "Renomear categoria personalizada",
          security: secured,
          params: idParams,
          body: z.object({ name: categoryName }),
          response: { 200: categoryResponse },
        },
      },
      async (request) => categories.rename(requireAuth(request).userId, request.params.id, request.body.name),
    );

    app.delete(
      "/:id",
      {
        schema: {
          tags: ["Categorias"],
          summary: "Excluir categoria personalizada",
          description: "Transações já registradas mantêm a categoria; ela deixa de aparecer para novos registros.",
          security: secured,
          params: idParams,
        },
      },
      async (request, reply) => {
        await categories.delete(requireAuth(request).userId, request.params.id);
        return reply.status(204).send();
      },
    );
  };
}
