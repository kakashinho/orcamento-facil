import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { NotificationController } from "../controllers/notification.controller.js";
import { notificationRouteSchemas as schemas } from "../schemas/notification.schema.js";

/** Prefixo: /api/notifications — todas as rotas exigem login. */
export function notificationRoutes(controller: NotificationController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.get("/unread-count", { schema: schemas.unreadCount }, controller.unreadCount);
    app.post("/read-all", { schema: schemas.markAllRead }, controller.markAllRead);
    app.get("/settings", { schema: schemas.getSettings }, controller.getSettings);
    app.patch("/settings", { schema: schemas.updateSettings }, controller.updateSettings);
    app.post("/:id/read", { schema: schemas.markRead }, controller.markRead);
  };
}
