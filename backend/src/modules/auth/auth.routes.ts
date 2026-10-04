import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../../http/auth.js";
import { type RouteDeps, requestMeta } from "../../http/route-deps.js";
import { currencyCode, secured } from "../../http/schemas.js";
import { userResponse } from "../users/user.dto.js";

const email = z.email("Informe um e-mail válido").max(320).meta({ example: "maria@exemplo.com" });
const password = z.string().min(1).max(128).meta({ example: "Senha@Forte123" });

const tokensResponse = z
  .object({
    tokenType: z.literal("Bearer"),
    accessToken: z.string(),
    expiresIn: z.number().meta({ description: "Validade do access token, em segundos" }),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.string(),
  })
  .meta({ id: "AuthTokens" });

const authResponse = z.object({ user: userResponse, tokens: tokensResponse }).meta({ id: "AuthResult" });

const refreshBody = z.object({ refreshToken: z.string().min(1) });

export function authRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { auth } = deps.container;
  const rateLimit = { rateLimit: { max: deps.container.config.auth.rateLimitMax, timeWindow: "1 minute" } };

  return async (app) => {
    app.post(
      "/register",
      {
        config: rateLimit,
        schema: {
          tags: ["Autenticação"],
          summary: "Criar conta (R02)",
          description:
            "Cadastro com e-mail, nome de usuário e senha forte (mín. 8 caracteres com maiúscula, minúscula, número e símbolo). Cria uma carteira padrão e já devolve a sessão.",
          body: z.object({
            email,
            username: z
              .string()
              .min(3, "O nome de usuário deve ter pelo menos 3 caracteres")
              .max(30)
              .regex(/^[A-Za-z0-9_.]+$/, "Use apenas letras, números, ponto e sublinhado")
              .meta({ example: "maria.silva" }),
            password,
            primaryCurrency: currencyCode.optional(),
          }),
          response: { 201: authResponse },
        },
      },
      async (request, reply) => reply.status(201).send(await auth.register(request.body, requestMeta(request))),
    );

    app.post(
      "/login",
      {
        config: rateLimit,
        schema: {
          tags: ["Autenticação"],
          summary: "Login (R03, R87)",
          description:
            "Autentica por e-mail ou nome de usuário. Após tentativas consecutivas sem sucesso, a conta é bloqueada temporariamente (HTTP 423).",
          body: z
            .object({ email: email.optional(), username: z.string().min(1).max(30).optional(), password })
            .refine((body) => body.email !== undefined || body.username !== undefined, {
              message: "Informe o e-mail ou o nome de usuário",
            }),
          response: { 200: authResponse },
        },
      },
      async (request) => auth.login(request.body, requestMeta(request)),
    );

    // Sem limite por IP: refresh tokens têm 256 bits de entropia (força bruta inviável) e,
    // atrás de CGNAT de operadora, muitos usuários legítimos compartilham o mesmo IP.
    app.post(
      "/refresh",
      {
        schema: {
          tags: ["Autenticação"],
          summary: "Renovar sessão",
          description: "Troca o refresh token por um novo par de tokens (rotação). Reutilizar um refresh token já usado encerra a sessão.",
          body: refreshBody,
          response: { 200: tokensResponse },
        },
      },
      async (request) => auth.refresh(request.body.refreshToken, requestMeta(request)),
    );

    app.post(
      "/logout",
      {
        schema: {
          tags: ["Autenticação"],
          summary: "Encerrar a sessão do refresh token informado",
          body: refreshBody,
        },
      },
      async (request, reply) => {
        await auth.logout(request.body.refreshToken);
        return reply.status(204).send();
      },
    );

    app.post(
      "/logout-all",
      {
        onRequest: deps.authenticate,
        schema: {
          tags: ["Autenticação"],
          summary: "Encerrar todas as sessões do usuário",
          security: secured,
        },
      },
      async (request, reply) => {
        await auth.logoutAll(requireAuth(request).userId);
        return reply.status(204).send();
      },
    );

    app.post(
      "/password/forgot",
      {
        config: rateLimit,
        schema: {
          tags: ["Autenticação"],
          summary: "Solicitar recuperação de senha (R04)",
          description:
            "Envia um link de redefinição para o e-mail cadastrado. A resposta é sempre a mesma, exista ou não a conta.",
          body: z.object({ email }),
          response: { 202: z.object({ message: z.string() }) },
        },
      },
      async (request, reply) => {
        await auth.requestPasswordReset(request.body.email, requestMeta(request));
        return reply.status(202).send({
          message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
        });
      },
    );

    app.post(
      "/password/reset",
      {
        config: rateLimit,
        schema: {
          tags: ["Autenticação"],
          summary: "Redefinir senha com o token recebido por e-mail (R04)",
          description: "Consome o link (uso único), troca a senha e encerra todas as sessões.",
          body: z.object({ token: z.string().min(1), password }),
        },
      },
      async (request, reply) => {
        await auth.resetPassword(request.body.token, request.body.password, requestMeta(request));
        return reply.status(204).send();
      },
    );

    app.post(
      "/password/change",
      {
        onRequest: deps.authenticate,
        schema: {
          tags: ["Autenticação"],
          summary: "Trocar a senha (usuário autenticado)",
          security: secured,
          body: z.object({ currentPassword: password, newPassword: password }),
        },
      },
      async (request, reply) => {
        const context = requireAuth(request);
        await auth.changePassword(
          context.userId,
          context.sessionId,
          request.body.currentPassword,
          request.body.newPassword,
          requestMeta(request),
        );
        return reply.status(204).send();
      },
    );
  };
}
