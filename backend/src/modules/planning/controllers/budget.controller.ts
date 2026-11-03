import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { budgetRouteSchemas } from "../schemas/budget.schema.js";
import type { BudgetService } from "../services/budget.service.js";

type Schemas = typeof budgetRouteSchemas;

export class BudgetController {
  constructor(private readonly budgets: BudgetService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.budgets.list(requireAuth(request).userId, request.query.month));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.budgets.create(requireAuth(request).userId, request.body));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.budgets.update(requireAuth(request).userId, request.params.id, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.budgets.remove(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };

  status = async (request: ZodRequest<Schemas["status"]>, reply: ZodReply<Schemas["status"]>) => {
    return reply.send(await this.budgets.status(requireAuth(request).userId, request.query));
  };

  history = async (request: ZodRequest<Schemas["history"]>, reply: ZodReply<Schemas["history"]>) => {
    return reply.send(await this.budgets.history(requireAuth(request).userId, request.query));
  };
}
