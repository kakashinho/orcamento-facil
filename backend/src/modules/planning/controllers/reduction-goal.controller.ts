import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { reductionGoalRouteSchemas } from "../schemas/reduction-goal.schema.js";
import type { ReductionGoalService } from "../services/reduction-goal.service.js";

type Schemas = typeof reductionGoalRouteSchemas;

export class ReductionGoalController {
  constructor(private readonly goals: ReductionGoalService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.goals.list(requireAuth(request).userId, request.query.month));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.goals.create(requireAuth(request).userId, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.goals.remove(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
