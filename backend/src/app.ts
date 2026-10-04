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
import { createErrorHandler } from "./infrastructure/http/error-handler.js";
import { documentErrorResponses } from "./infrastructure/http/error-responses.js";
import { createMaintenanceGate } from "./infrastructure/http/maintenance-gate.js";
import type { App } from "./infrastructure/http/types.js";
import { configureValidationMessages } from "./infrastructure/http/validation-messages.js";
import { authRoutes } from "./modules/auth/routes/auth.routes.js";
import { biometricRoutes } from "./modules/auth/routes/biometric.routes.js";
import { resetPasswordRoutes } from "./modules/auth/routes/reset-password.routes.js";
import { userRoutes } from "./modules/auth/routes/user.routes.js";
import { categoryRoutes } from "./modules/finance/routes/category.routes.js";
import { currencyRoutes } from "./modules/finance/routes/currency.routes.js";
import { exchangeRateRoutes } from "./modules/finance/routes/exchange-rate.routes.js";
import { tagRoutes } from "./modules/finance/routes/tag.routes.js";
import { transactionRoutes } from "./modules/finance/routes/transaction.routes.js";
import { transferRoutes } from "./modules/finance/routes/transfer.routes.js";
import { walletRoutes } from "./modules/finance/routes/wallet.routes.js";
import { historyRoutes } from "./modules/history/routes/history.routes.js";
import { reportRoutes } from "./modules/reports/routes/report.routes.js";
import { adminRoutes } from "./modules/system/routes/admin.routes.js";
import { systemRoutes } from "./modules/system/routes/system.routes.js";
import { API_VERSION, DEFAULT_MAINTENANCE_MESSAGE } from "./modules/system/types/system.types.js";

/** Monta o Fastify: plugins, hooks globais, tratamento de erros e registro das rotas dos módulos. */
export async function buildApp(container: Container): Promise<App> {
  const { config, controllers, guards } = container;
  configureValidationMessages();

  const app = Fastify({
    loggerInstance: container.logger as FastifyBaseLogger,
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(header) ? header : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Validação (DTOs de entrada) e serialização (DTOs de resposta) pelos schemas Zod.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("auth", null);
  // R88: cada rota documenta também as respostas de erro que pode devolver.
  app.addHook("onRoute", documentErrorResponses);

  // A API só aceita JSON. Corpo vazio com Content-Type JSON vale como "sem corpo" (muitos
  // clientes HTTP enviam o cabeçalho em todo POST); texto puro recebe 415.
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser(["application/json", "text/plain"]);
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const text = body.toString();
    if (text.trim() === "") {
      done(null, undefined);
      return;
    }
    parseJson(request, text, done);
  });

  await app.register(cors, {
    origin: config.corsOrigins === "*" ? true : config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["x-request-id", "retry-after", "content-disposition", "www-authenticate"],
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

  // R88: documentação da API gerada a partir dos próprios schemas (DTOs).
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Orçamento Fácil — API",
        version: API_VERSION,
        description:
          "API RESTful do Orçamento Fácil (Sprint 1). Valores monetários são números com até 2 casas decimais na moeda da carteira; datas no formato AAAA-MM-DD. Corpos e filtros são validados de forma estrita: campo desconhecido é erro. Erros seguem o formato { statusCode, code, message, details? }, e `details` aponta cada campo inválido.",
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
  app.addHook(
    "onRequest",
    createMaintenanceGate(() => container.services.maintenance.getState(), DEFAULT_MAINTENANCE_MESSAGE),
  );

  app.setErrorHandler(createErrorHandler(container.eventLog));
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: `Rota ${request.method} ${request.url.split("?")[0]} não encontrada.`,
    }),
  );

  // Rotas de cada módulo: route → controller → service → repository.
  await app.register(systemRoutes(controllers.system));
  await app.register(authRoutes(controllers.auth, guards), { prefix: "/api/auth" });
  await app.register(biometricRoutes(controllers.biometric, guards), { prefix: "/api/auth/biometric" });
  await app.register(userRoutes(controllers.user, guards), { prefix: "/api/users" });
  await app.register(walletRoutes(controllers.wallet, guards), { prefix: "/api/wallets" });
  await app.register(categoryRoutes(controllers.category, guards), { prefix: "/api/categories" });
  await app.register(tagRoutes(controllers.tag, guards), { prefix: "/api/tags" });
  await app.register(transactionRoutes(controllers.transaction, guards), { prefix: "/api/transactions" });
  await app.register(transferRoutes(controllers.transfer, guards), { prefix: "/api/transfers" });
  await app.register(exchangeRateRoutes(controllers.exchangeRate, guards), { prefix: "/api/exchange-rates" });
  await app.register(currencyRoutes(controllers.exchangeRate), { prefix: "/api/currencies" });
  await app.register(historyRoutes(controllers.history, guards), { prefix: "/api/history" });
  await app.register(reportRoutes(controllers.report, guards), { prefix: "/api/reports" });
  await app.register(adminRoutes(controllers.admin, guards), { prefix: "/api/admin" });
  await app.register(resetPasswordRoutes(controllers.resetPassword));

  app.addHook("onClose", async () => {
    await container.eventLog.flush();
  });

  return app;
}
