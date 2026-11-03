import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { ReminderController } from "../controllers/reminder.controller.js";
import { reminderRouteSchemas as schemas } from "../schemas/reminder.schema.js";

/** Prefixo: /api/reminders — todas as rotas exigem login. */
export function reminderRoutes(controller: ReminderController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook("onRequest", guards.authenticate);

    app.get("/", { schema: schemas.list }, controller.list);
    app.post("/", { schema: schemas.create }, controller.create);
    app.patch("/:id", { schema: schemas.update }, controller.update);
    app.delete("/:id", { schema: schemas.remove }, controller.remove);
  };
}
