import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { currencyCode, secured } from "../../http/schemas.js";
import { userResponse } from "./user.dto.js";

export function userRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { users } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/me",
      {
        schema: { tags: ["Usuário"], summary: "Dados do usuário autenticado", security: secured, response: { 200: userResponse } },
      },
      async (request) => users.me(requireAuth(request).userId),
    );

    app.patch(
      "/me",
      {
        schema: {
          tags: ["Usuário"],
          summary: "Atualizar perfil — nome de usuário, moeda principal (R28) e fuso horário",
          security: secured,
          body: z.object({
            username: z
              .string()
              .min(3)
              .max(30)
              .regex(/^[A-Za-z0-9_.]+$/, "Use apenas letras, números, ponto e sublinhado")
              .optional(),
            primaryCurrency: currencyCode.optional(),
            timezone: z.string().min(1).max(64).meta({ example: "America/Sao_Paulo" }).optional(),
          }),
          response: { 200: userResponse },
        },
      },
      async (request) => users.update(requireAuth(request).userId, request.body),
    );
  };
}
