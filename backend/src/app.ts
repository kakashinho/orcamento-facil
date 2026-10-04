import { randomUUID } from "node:crypto";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyBaseLogger } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Container } from "./container.js";
import { createAuthenticate } from "./http/auth.js";
import { createErrorHandler } from "./http/error-handler.js";
import type { RouteDeps } from "./http/route-deps.js";
import type { App } from "./http/types.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { resetPasswordPage } from "./modules/auth/reset-password.page.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { exchangeRateRoutes } from "./modules/exchange-rates/exchange-rate.routes.js";
import { historyRoutes } from "./modules/history/history.routes.js";
import { reportRoutes } from "./modules/reports/report.routes.js";
import { DEFAULT_MAINTENANCE_MESSAGE } from "./modules/system/maintenance.service.js";
import { API_VERSION, adminRoutes, healthRoutes, systemRoutes } from "./modules/system/system.routes.js";
import { tagRoutes } from "./modules/tags/tag.routes.js";
import { transactionRoutes } from "./modules/transactions/transaction.routes.js";
import { transferRoutes } from "./modules/transfers/transfer.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { walletRoutes } from "./modules/wallets/wallet.routes.js";
import { errors } from "./shared/errors.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Rotas de escrita liberadas durante a manutenção: entrar/sair e a própria administração. */
const MAINTENANCE_EXEMPT = new Set(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/logout-all"]);

function isMaintenanceExempt(path: string): boolean {
  return MAINTENANCE_EXEMPT.has(path) || path.startsWith("/api/admin/") || !(path.startsWith("/api/") || path === "/reset-password");
}

export async function buildApp(container: Container): Promise<App> {
  const { config } = container;

  const app = Fastify({
    loggerInstance: container.logger as FastifyBaseLogger,
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(header) ? header : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("auth", null);

  await app.register(cors, {
    origin: config.corsOrigins === "*" ? true : config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-request-id", "retry-after", "content-disposition"],
  });

  // R86: respostas comprimidas (br/gzip/deflate conforme Accept-Encoding) e aceitação de
  // corpos de requisição comprimidos (Content-Encoding), para economizar dados móveis.
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ["br", "gzip", "deflate"],
    requestEncodings: ["br", "gzip", "deflate"],
  });

  await app.register(rateLimit, { global: false });

  // R88: documentação da API gerada a partir dos próprios schemas de validação.
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Orçamento Fácil — API",
        version: API_VERSION,
        description:
          "API RESTful do Orçamento Fácil (Sprint 1). Valores monetários são números com até 2 casas decimais na moeda da carteira; datas no formato AAAA-MM-DD. Erros seguem o formato { statusCode, code, message, details? }.",
      },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    if (!reply.hasHeader("cache-control") && request.url.startsWith("/api/")) {
      // Dados financeiros não devem ficar em caches intermediários.
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  // R72: em manutenção, operações que alteram dados são recusadas com aviso ao usuário.
  app.addHook("onRequest", async (request) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    const path = request.url.split("?")[0] ?? "";
    if (isMaintenanceExempt(path)) return;
    const state = await container.maintenance.getState();
    if (state.enabled) {
      throw errors.maintenance(state.message ?? DEFAULT_MAINTENANCE_MESSAGE);
    }
  });

  app.setErrorHandler(createErrorHandler(container.eventLog));
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: `Rota ${request.method} ${request.url.split("?")[0]} não encontrada.`,
    }),
  );

  const deps: RouteDeps = {
    container,
    authenticate: createAuthenticate(container.accessTokens, container.auth),
  };

  await app.register(healthRoutes(deps));
  await app.register(authRoutes(deps), { prefix: "/api/auth" });
  await app.register(userRoutes(deps), { prefix: "/api/users" });
  await app.register(walletRoutes(deps), { prefix: "/api/wallets" });
  await app.register(categoryRoutes(deps), { prefix: "/api/categories" });
  await app.register(tagRoutes(deps), { prefix: "/api/tags" });
  await app.register(transactionRoutes(deps), { prefix: "/api/transactions" });
  await app.register(transferRoutes(deps), { prefix: "/api/transfers" });
  await app.register(historyRoutes(deps), { prefix: "/api/history" });
  await app.register(exchangeRateRoutes(deps), { prefix: "/api/exchange-rates" });
  await app.register(reportRoutes(deps), { prefix: "/api/reports" });
  await app.register(systemRoutes(deps), { prefix: "/api/system" });
  await app.register(adminRoutes(deps), { prefix: "/api/admin" });
  await app.register(resetPasswordPage(deps));

  app.addHook("onClose", async () => {
    await container.eventLog.flush();
  });

  return app;
}
