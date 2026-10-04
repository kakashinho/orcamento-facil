import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { idParams, isoDate, limitQuery, positiveAmount, secured } from "../../http/schemas.js";

const walletSummary = z.object({ id: z.string(), name: z.string(), currency: z.string() });

const transferResponse = z
  .object({
    id: z.string(),
    sourceWallet: walletSummary,
    targetWallet: walletSummary,
    amount: z.number().meta({ description: "Valor debitado, na moeda da carteira de origem" }),
    targetAmount: z.number().meta({ description: "Valor creditado, na moeda da carteira de destino" }),
    exchangeRate: z.number().nullable().meta({ description: "Taxa aplicada quando as moedas diferem" }),
    date: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "Transfer" });

export function transferRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { transfers } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Transferências"],
          summary: "Listar transferências entre carteiras",
          security: secured,
          querystring: z.object({
            walletId: z.uuid().optional(),
            from: isoDate.optional(),
            to: isoDate.optional(),
            limit: limitQuery,
            cursor: z.string().max(500).optional(),
          }),
          response: { 200: z.object({ data: z.array(transferResponse), nextCursor: z.string().nullable() }) },
        },
      },
      async (request) => transfers.list(requireAuth(request).userId, request.query),
    );

    app.post(
      "/",
      {
        schema: {
          tags: ["Transferências"],
          summary: "Transferir entre carteiras (R54)",
          description:
            "Debita a origem e credita o destino atomicamente, sem gerar receita ou despesa. Entre moedas diferentes, converte pela cotação atual (R29) ou usa `targetAmount`, se informado. Envie o cabeçalho `Idempotency-Key` para tornar repetições seguras.",
          security: secured,
          headers: z.object({ "idempotency-key": z.string().min(8).max(100).optional() }),
          body: z.object({
            sourceWalletId: z.uuid(),
            targetWalletId: z.uuid(),
            amount: positiveAmount,
            targetAmount: positiveAmount.optional(),
            date: isoDate.optional(),
            description: z.string().max(200).optional(),
          }),
          response: { 200: transferResponse, 201: transferResponse },
        },
      },
      async (request, reply) => {
        const result = await transfers.create(
          requireAuth(request).userId,
          request.body,
          request.headers["idempotency-key"],
        );
        return reply.status(result.created ? 201 : 200).send(result.transfer);
      },
    );

    app.get(
      "/:id",
      {
        schema: { tags: ["Transferências"], summary: "Detalhar transferência", security: secured, params: idParams, response: { 200: transferResponse } },
      },
      async (request) => transfers.get(requireAuth(request).userId, request.params.id),
    );

    app.delete(
      "/:id",
      {
        schema: {
          tags: ["Transferências"],
          summary: "Excluir transferência (estorna os saldos; pode ser desfeita)",
          security: secured,
          params: idParams,
        },
      },
      async (request, reply) => {
        await transfers.delete(requireAuth(request).userId, request.params.id);
        return reply.status(204).send();
      },
    );
  };
}
