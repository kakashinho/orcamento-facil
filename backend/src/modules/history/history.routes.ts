import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { secured } from "../../http/schemas.js";
import { HISTORY_ACTIONS } from "./action-history.js";

const entry = z.object({
  id: z.string(),
  action: z.enum(HISTORY_ACTIONS),
  entityType: z.enum(["transaction", "transfer"]),
  entityId: z.string().nullable(),
  createdAt: z.string(),
});

export function historyRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { history, undo, config } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Histórico"],
          summary: "Últimas ações do usuário",
          description: `Ações desfazíveis: criação, edição, exclusão e arquivamento de transações; criação e exclusão de transferências. Janela de ${config.undoWindowHours} h.`,
          security: secured,
          querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
          response: {
            200: z.object({
              data: z.array(entry.extend({ undoneAt: z.string().nullable(), undoable: z.boolean() })),
            }),
          },
        },
      },
      async (request) => ({ data: await history.list(requireAuth(request).userId, request.query.limit) }),
    );

    app.post(
      "/undo",
      {
        schema: {
          tags: ["Histórico"],
          summary: "Desfazer a última ação (R49)",
          description:
            "Reverte a ação mais recente ainda não desfeita, recompondo saldos. Chamadas seguidas desfazem as ações anteriores. 404 NOTHING_TO_UNDO quando não há o que desfazer.",
          security: secured,
          response: { 200: z.object({ undone: entry, message: z.string() }) },
        },
      },
      async (request) => undo.undoLast(requireAuth(request).userId, request.id),
    );
  };
}
