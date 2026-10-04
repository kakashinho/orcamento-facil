import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { WALLET_TYPES } from "../../db/schema.js";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { currencyCode, idParams, secured, signedAmount } from "../../http/schemas.js";

export const walletResponse = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(WALLET_TYPES),
    currency: z.string(),
    isDefault: z.boolean(),
    balance: z.number().meta({ description: "Saldo atual na moeda da carteira" }),
    initialBalance: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Wallet" });

const walletName = z.string().min(1).max(60).meta({ example: "Conta corrente" });

export function walletRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { wallets } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Carteiras"],
          summary: "Listar carteiras com saldo atual (R53, R55)",
          security: secured,
          response: { 200: z.object({ data: z.array(walletResponse) }) },
        },
      },
      async (request) => ({ data: await wallets.list(requireAuth(request).userId) }),
    );

    app.get(
      "/summary",
      {
        schema: {
          tags: ["Carteiras"],
          summary: "Resumo da tela inicial: saldo de cada carteira e total na moeda principal (R55, R28, R29)",
          security: secured,
          response: {
            200: z.object({
              primaryCurrency: z.string(),
              totalBalance: z.number().nullable().meta({ description: "Nulo se alguma cotação estiver indisponível" }),
              ratesUpdatedAt: z.string().nullable(),
              ratesStale: z.boolean(),
              wallets: z.array(walletResponse.extend({ balanceInPrimaryCurrency: z.number().nullable() })),
            }),
          },
        },
      },
      async (request) => wallets.summary(requireAuth(request).userId),
    );

    app.post(
      "/",
      {
        schema: {
          tags: ["Carteiras"],
          summary: "Criar carteira (R53), com moeda própria (R56)",
          security: secured,
          body: z.object({
            name: walletName,
            type: z.enum(WALLET_TYPES).optional(),
            currency: currencyCode.optional().meta({ description: "Padrão: moeda principal do usuário" }),
            initialBalance: signedAmount.optional(),
            isDefault: z.boolean().optional(),
          }),
          response: { 201: walletResponse },
        },
      },
      async (request, reply) => reply.status(201).send(await wallets.create(requireAuth(request).userId, request.body)),
    );

    app.get(
      "/:id",
      {
        schema: { tags: ["Carteiras"], summary: "Detalhar carteira", security: secured, params: idParams, response: { 200: walletResponse } },
      },
      async (request) => wallets.get(requireAuth(request).userId, request.params.id),
    );

    app.patch(
      "/:id",
      {
        schema: {
          tags: ["Carteiras"],
          summary: "Atualizar carteira",
          description: "A moeda só pode ser alterada enquanto a carteira não tiver movimentações.",
          security: secured,
          params: idParams,
          body: z.object({
            name: walletName.optional(),
            type: z.enum(WALLET_TYPES).optional(),
            currency: currencyCode.optional(),
            initialBalance: signedAmount.optional(),
            isDefault: z.literal(true).optional(),
          }),
          response: { 200: walletResponse },
        },
      },
      async (request) => wallets.update(requireAuth(request).userId, request.params.id, request.body),
    );

    app.delete(
      "/:id",
      {
        schema: {
          tags: ["Carteiras"],
          summary: "Excluir carteira sem movimentações",
          security: secured,
          params: idParams,
        },
      },
      async (request, reply) => {
        await wallets.delete(requireAuth(request).userId, request.params.id);
        return reply.status(204).send();
      },
    );
  };
}
