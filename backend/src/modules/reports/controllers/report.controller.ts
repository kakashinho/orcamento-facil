import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { reportRouteSchemas } from "../schemas/report.schema.js";
import type { ReportService } from "../services/report.service.js";

type Schemas = typeof reportRouteSchemas;

export class ReportController {
  constructor(private readonly reports: ReportService) {}

  overview = async (request: ZodRequest<Schemas["overview"]>, reply: ZodReply<Schemas["overview"]>) => {
    return reply.send(await this.reports.overview(requireAuth(request).userId, request.query));
  };

  statement = async (request: ZodRequest<Schemas["statement"]>, reply: ZodReply<Schemas["statement"]>) => {
    return reply.send(await this.reports.statement(requireAuth(request).userId, request.query));
  };

  statementPdf = async (request: ZodRequest<Schemas["statementPdf"]>, reply: ZodReply<Schemas["statementPdf"]>) => {
    const { pdf, filename } = await this.reports.statementPdf(requireAuth(request).userId, request.query);
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(pdf);
  };

  cashFlow = async (request: ZodRequest<Schemas["cashFlow"]>, reply: ZodReply<Schemas["cashFlow"]>) => {
    return reply.send(await this.reports.cashFlow(requireAuth(request).userId, request.query));
  };

  byCategory = async (request: ZodRequest<Schemas["byCategory"]>, reply: ZodReply<Schemas["byCategory"]>) => {
    return reply.send(await this.reports.byCategory(requireAuth(request).userId, request.query));
  };

  monthly = async (request: ZodRequest<Schemas["monthly"]>, reply: ZodReply<Schemas["monthly"]>) => {
    return reply.send(await this.reports.monthly(requireAuth(request).userId, request.query));
  };

  balanceEvolution = async (
    request: ZodRequest<Schemas["balanceEvolution"]>,
    reply: ZodReply<Schemas["balanceEvolution"]>,
  ) => {
    return reply.send(await this.reports.balanceEvolution(requireAuth(request).userId, request.query));
  };

  projection = async (request: ZodRequest<Schemas["projection"]>, reply: ZodReply<Schemas["projection"]>) => {
    return reply.send(await this.reports.projection(requireAuth(request).userId, request.query));
  };

  monthIndicators = async (request: ZodRequest<Schemas["monthIndicators"]>, reply: ZodReply<Schemas["monthIndicators"]>) => {
    return reply.send(await this.reports.monthIndicators(requireAuth(request).userId, request.query));
  };
}
