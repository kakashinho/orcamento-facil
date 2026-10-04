import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { ReportController } from "../controllers/report.controller.js";
import { reportRouteSchemas as schemas } from "../schemas/report.schema.js";

/** Prefixo: /api/reports — todas as rotas exigem login. */
export function reportRoutes(controller: ReportController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/statement", { schema: schemas.statement }, controller.statement);
    app.get("/statement/pdf", { schema: schemas.statementPdf }, controller.statementPdf);
    app.get("/cash-flow", { schema: schemas.cashFlow }, controller.cashFlow);
    app.get("/by-category", { schema: schemas.byCategory }, controller.byCategory);
    app.get("/monthly", { schema: schemas.monthly }, controller.monthly);
  };
}
