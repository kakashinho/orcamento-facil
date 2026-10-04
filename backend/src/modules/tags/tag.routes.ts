import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { idParams, secured } from "../../http/schemas.js";

const tagResponse = z
  .object({ id: z.string(), name: z.string(), transactionCount: z.number() })
  .meta({ id: "Tag" });

const tagName = z.string().min(1).max(40).meta({ example: "viagem" });

export function tagRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { tags } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Tags"],
          summary: "Listar tags do usuário (R43)",
          security: secured,
          response: { 200: z.object({ data: z.array(tagResponse) }) },
        },
      },
      async (request) => ({ data: await tags.list(requireAuth(request).userId) }),
    );

    app.post(
      "/",
      {
        schema: {
          tags: ["Tags"],
          summary: "Criar tag",
          security: secured,
          body: z.object({ name: tagName }),
          response: { 201: tagResponse },
        },
      },
      async (request, reply) => reply.status(201).send(await tags.create(requireAuth(request).userId, request.body.name)),
    );

    app.patch(
      "/:id",
      {
        schema: {
          tags: ["Tags"],
          summary: "Renomear tag",
          security: secured,
          params: idParams,
          body: z.object({ name: tagName }),
          response: { 200: tagResponse },
        },
      },
      async (request) => tags.rename(requireAuth(request).userId, request.params.id, request.body.name),
    );

    app.delete(
      "/:id",
      {
        schema: {
          tags: ["Tags"],
          summary: "Excluir tag (as transações permanecem)",
          security: secured,
          params: idParams,
        },
      },
      async (request, reply) => {
        await tags.delete(requireAuth(request).userId, request.params.id);
        return reply.status(204).send();
      },
    );
  };
}
