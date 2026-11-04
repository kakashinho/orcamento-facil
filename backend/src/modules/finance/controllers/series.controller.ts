import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { seriesRouteSchemas } from "../schemas/series.schema.js";
import type { SeriesService } from "../services/series.service.js";

type Schemas = typeof seriesRouteSchemas;

/** Criação com 201; 200 quando a mesma Idempotency-Key já tinha criado a série. */
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  createRecurring = async (request: ZodRequest<Schemas["createRecurring"]>, reply: ZodReply<Schemas["createRecurring"]>) => {
    const result = await this.series.createRecurring(
      requireAuth(request).userId,
      request.body,
      request.headers["idempotency-key"],
    );
    return reply.status(result.created ? 201 : 200).send(result.response);
  };

  markRecurring = async (request: ZodRequest<Schemas["markRecurring"]>, reply: ZodReply<Schemas["markRecurring"]>) => {
    const { userId } = requireAuth(request);
    return reply.status(201).send(await this.series.markRecurring(userId, request.params.transactionId, request.body));
  };

  createInstallments = async (
    request: ZodRequest<Schemas["createInstallments"]>,
    reply: ZodReply<Schemas["createInstallments"]>,
  ) => {
    const result = await this.series.createInstallments(
      requireAuth(request).userId,
      request.body,
      request.headers["idempotency-key"],
    );
    return reply.status(result.created ? 201 : 200).send(result.response);
  };

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.series.list(requireAuth(request).userId, request.query));
  };

  get = async (request: ZodRequest<Schemas["get"]>, reply: ZodReply<Schemas["get"]>) => {
    return reply.send(await this.series.get(requireAuth(request).userId, request.params.id));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.series.update(requireAuth(request).userId, request.params.id, request.body));
  };

  cancel = async (request: ZodRequest<Schemas["cancel"]>, reply: ZodReply<Schemas["cancel"]>) => {
    await this.series.cancel(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
