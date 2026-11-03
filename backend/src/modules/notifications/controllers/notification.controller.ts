import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { notificationRouteSchemas } from "../schemas/notification.schema.js";
import type { NotificationService } from "../services/notification.service.js";

type Schemas = typeof notificationRouteSchemas;

export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.notifications.list(requireAuth(request).userId, request.query));
  };

  unreadCount = async (request: ZodRequest<Schemas["unreadCount"]>, reply: ZodReply<Schemas["unreadCount"]>) => {
    return reply.send({ count: await this.notifications.countUnread(requireAuth(request).userId) });
  };

  markRead = async (request: ZodRequest<Schemas["markRead"]>, reply: ZodReply<Schemas["markRead"]>) => {
    return reply.send(await this.notifications.markRead(requireAuth(request).userId, request.params.id));
  };

  markAllRead = async (request: ZodRequest<Schemas["markAllRead"]>, reply: ZodReply<Schemas["markAllRead"]>) => {
    return reply.send(await this.notifications.markAllRead(requireAuth(request).userId));
  };

  registerDevice = async (request: ZodRequest<Schemas["registerDevice"]>, reply: ZodReply<Schemas["registerDevice"]>) => {
    const { token, deviceName } = request.body;
    return reply.status(201).send(await this.notifications.registerDevice(requireAuth(request).userId, token, deviceName || null));
  };

  unregisterDevice = async (request: ZodRequest<Schemas["unregisterDevice"]>, reply: ZodReply<Schemas["unregisterDevice"]>) => {
    await this.notifications.unregisterDevice(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };

  getSettings = async (request: ZodRequest<Schemas["getSettings"]>, reply: ZodReply<Schemas["getSettings"]>) => {
    return reply.send(await this.notifications.getSettings(requireAuth(request).userId));
  };

  updateSettings = async (request: ZodRequest<Schemas["updateSettings"]>, reply: ZodReply<Schemas["updateSettings"]>) => {
    return reply.send(await this.notifications.updateSettings(requireAuth(request).userId, request.body));
  };
}
