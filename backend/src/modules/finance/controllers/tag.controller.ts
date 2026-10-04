import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { tagRouteSchemas } from "../schemas/tag.schema.js";
import type { TagService } from "../services/tag.service.js";

type Schemas = typeof tagRouteSchemas;

export class TagController {
  constructor(private readonly tags: TagService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.tags.list(requireAuth(request).userId));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.tags.create(requireAuth(request).userId, request.body.name));
  };

  rename = async (request: ZodRequest<Schemas["rename"]>, reply: ZodReply<Schemas["rename"]>) => {
    return reply.send(await this.tags.rename(requireAuth(request).userId, request.params.id, request.body.name));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.tags.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
