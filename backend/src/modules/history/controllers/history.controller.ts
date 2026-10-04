import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { historyRouteSchemas } from "../schemas/history.schema.js";
import type { ActionHistoryService } from "../services/action-history.service.js";
import type { UndoService } from "../services/undo.service.js";

type Schemas = typeof historyRouteSchemas;

export class HistoryController {
  constructor(
    private readonly history: ActionHistoryService,
    private readonly undoService: UndoService,
  ) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.history.list(requireAuth(request).userId, request.query.limit));
  };

  undo = async (request: ZodRequest<Schemas["undo"]>, reply: ZodReply<Schemas["undo"]>) => {
    return reply.send(await this.undoService.undoLast(requireAuth(request).userId, request.id));
  };
}
