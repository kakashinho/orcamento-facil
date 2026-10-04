import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { categoryRouteSchemas } from "../schemas/category.schema.js";
import type { CategoryService } from "../services/category.service.js";

type Schemas = typeof categoryRouteSchemas;

export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.categories.list(requireAuth(request).userId, request.query.type));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.categories.create(requireAuth(request).userId, request.body));
  };

  suggest = async (request: ZodRequest<Schemas["suggest"]>, reply: ZodReply<Schemas["suggest"]>) => {
    const { description, type } = request.body;
    return reply.send(await this.categories.suggest(requireAuth(request).userId, description, type));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.categories.update(requireAuth(request).userId, request.params.id, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.categories.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
