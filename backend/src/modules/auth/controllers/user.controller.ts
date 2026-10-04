import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { userRouteSchemas } from "../schemas/user.schema.js";
import type { UserService } from "../services/user.service.js";

type Schemas = typeof userRouteSchemas;

export class UserController {
  constructor(private readonly users: UserService) {}

  getMe = async (request: ZodRequest<Schemas["getMe"]>, reply: ZodReply<Schemas["getMe"]>) => {
    return reply.send(await this.users.getProfile(requireAuth(request).userId));
  };

  updateMe = async (request: ZodRequest<Schemas["updateMe"]>, reply: ZodReply<Schemas["updateMe"]>) => {
    return reply.send(await this.users.updateProfile(requireAuth(request).userId, request.body));
  };
}
