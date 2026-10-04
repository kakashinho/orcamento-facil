import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { categoryRouteSchemas } from "../schemas/category.schema.js";
import type { CategoryService } from "../services/category.service.js";

type Schemas = typeof categoryRouteSchemas;

export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.categories.list(requireAuth(request).userId));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.categories.create(requireAuth(request).userId, request.body.name));
  };

  suggest = async (request: ZodRequest<Schemas["suggest"]>, reply: ZodReply<Schemas["suggest"]>) => {
    return reply.send(await this.categories.suggest(requireAuth(request).userId, request.body.description));
  };

  rename = async (request: ZodRequest<Schemas["rename"]>, reply: ZodReply<Schemas["rename"]>) => {
    return reply.send(await this.categories.rename(requireAuth(request).userId, request.params.id, request.body.name));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.categories.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
