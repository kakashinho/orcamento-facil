import { sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAdmin } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { secured } from "../../http/schemas.js";
import { DEFAULT_MAINTENANCE_MESSAGE } from "./maintenance.service.js";

export const API_VERSION = "1.0.0";

const maintenanceResponse = z
  .object({
    enabled: z.boolean(),
    message: z.string().nullable(),
    forced: z.boolean(),
    updatedAt: z.string().nullable(),
  })
  .meta({ id: "MaintenanceState" });

/** Saúde da aplicação (R85) — sem autenticação, para orquestrador/monitoramento. */
export function healthRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/health",
      {
        schema: {
          tags: ["Sistema"],
          summary: "Liveness: o processo está respondendo",
          response: { 200: z.object({ status: z.literal("ok") }) },
        },
      },
      async () => ({ status: "ok" as const }),
    );

    app.get(
      "/health/ready",
      {
        schema: {
          tags: ["Sistema"],
          summary: "Readiness: banco de dados acessível",
          response: {
            200: z.object({ status: z.literal("ok"), database: z.literal("up") }),
            503: z.object({ status: z.literal("degraded"), database: z.literal("down") }),
          },
        },
      },
      async (_request, reply) => {
        try {
          await deps.container.db.execute(sql`select 1`);
          return { status: "ok" as const, database: "up" as const };
        } catch (error) {
          deps.container.logger.error({ err: error }, "Banco de dados indisponível no readiness check");
          return reply.status(503).send({ status: "degraded" as const, database: "down" as const });
        }
      },
    );
  };
}

export function systemRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      "/status",
      {
        schema: {
          tags: ["Sistema"],
          summary: "Status público da API — o app consulta para informar manutenção (R72)",
          response: {
            200: z.object({
              status: z.literal("ok"),
              version: z.string(),
              time: z.string(),
              maintenance: z.object({ enabled: z.boolean(), message: z.string().nullable() }),
            }),
          },
        },
      },
      async () => {
        const state = await deps.container.maintenance.getState();
        return {
          status: "ok" as const,
          version: API_VERSION,
          time: deps.container.clock.now().toISOString(),
          maintenance: {
            enabled: state.enabled,
            message: state.enabled ? (state.message ?? DEFAULT_MAINTENANCE_MESSAGE) : null,
          },
        };
      },
    );
  };
}

export function adminRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { maintenance, eventLog } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);
    app.addHook("preHandler", async (request) => {
      requireAdmin(request);
    });

    app.get(
      "/maintenance",
      {
        schema: {
          tags: ["Administração"],
          summary: "Estado do modo de manutenção (R72)",
          security: secured,
          response: { 200: maintenanceResponse },
        },
      },
      async () => maintenance.getState(),
    );

    app.put(
      "/maintenance",
      {
        schema: {
          tags: ["Administração"],
          summary: "Ativar/desativar o modo de manutenção (R72)",
          description:
            "Com o modo ativo, operações que alteram dados retornam 503 MAINTENANCE_MODE com a mensagem configurada; consultas continuam disponíveis.",
          security: secured,
          body: z.object({ enabled: z.boolean(), message: z.string().max(500).nullable().optional() }),
          response: { 200: maintenanceResponse },
        },
      },
      async (request) => maintenance.setState(request.auth!.userId, request.body),
    );

    app.get(
      "/logs",
      {
        schema: {
          tags: ["Administração"],
          summary: "Eventos importantes e erros registrados (R85)",
          security: secured,
          querystring: z.object({
            event: z.string().max(80).optional().meta({ description: "Prefixo do evento, ex.: auth." }),
            level: z.enum(["info", "warn", "error"]).optional(),
            before: z.iso.datetime().optional(),
            limit: z.coerce.number().int().min(1).max(200).default(50),
          }),
          response: {
            200: z.object({
              data: z.array(
                z.object({
                  id: z.string(),
                  level: z.string(),
                  event: z.string(),
                  message: z.string().nullable(),
                  context: z.unknown(),
                  userId: z.string().nullable(),
                  requestId: z.string().nullable(),
                  createdAt: z.string(),
                }),
              ),
            }),
          },
        },
      },
      async (request) => ({
        data: await eventLog.list({
          ...(request.query.event ? { event: request.query.event } : {}),
          ...(request.query.level ? { level: request.query.level } : {}),
          ...(request.query.before ? { before: new Date(request.query.before) } : {}),
          limit: request.query.limit,
        }),
      }),
    );
  };
}
