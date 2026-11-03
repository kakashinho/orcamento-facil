import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { goalRouteSchemas } from "../schemas/goal.schema.js";
import type { GoalService } from "../services/goal.service.js";

type Schemas = typeof goalRouteSchemas;

export class GoalController {
  constructor(private readonly goals: GoalService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.goals.list(requireAuth(request).userId, request.query));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.goals.create(requireAuth(request).userId, request.body));
  };

  get = async (request: ZodRequest<Schemas["get"]>, reply: ZodReply<Schemas["get"]>) => {
    return reply.send(await this.goals.get(requireAuth(request).userId, request.params.id));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.goals.update(requireAuth(request).userId, request.params.id, request.body));
  };

  cancel = async (request: ZodRequest<Schemas["cancel"]>, reply: ZodReply<Schemas["cancel"]>) => {
    await this.goals.cancel(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };

  addContribution = async (request: ZodRequest<Schemas["addContribution"]>, reply: ZodReply<Schemas["addContribution"]>) => {
    const { userId } = requireAuth(request);
    return reply.status(201).send(await this.goals.addContribution(userId, request.params.id, request.body));
  };

  removeContribution = async (
    request: ZodRequest<Schemas["removeContribution"]>,
    reply: ZodReply<Schemas["removeContribution"]>,
  ) => {
    await this.goals.removeContribution(requireAuth(request).userId, request.params.id, request.params.contributionId);
    return reply.status(204).send();
  };

  contributionsByTransaction = async (
    request: ZodRequest<Schemas["contributionsByTransaction"]>,
    reply: ZodReply<Schemas["contributionsByTransaction"]>,
  ) => {
    return reply.send(await this.goals.contributionsByTransaction(requireAuth(request).userId, request.query.transactionId));
  };
}
