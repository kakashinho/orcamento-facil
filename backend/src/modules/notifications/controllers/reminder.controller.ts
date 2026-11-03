import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { reminderRouteSchemas } from "../schemas/reminder.schema.js";
import type { ReminderService } from "../services/reminder.service.js";

type Schemas = typeof reminderRouteSchemas;

export class ReminderController {
  constructor(private readonly reminders: ReminderService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.reminders.list(requireAuth(request).userId));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.reminders.create(requireAuth(request).userId, request.body));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.reminders.update(requireAuth(request).userId, request.params.id, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.reminders.remove(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
