import multipart from "@fastify/multipart";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { AttachmentController } from "../controllers/attachment.controller.js";
import { attachmentRouteSchemas as schemas } from "../schemas/attachment.schema.js";
import { MAX_ATTACHMENT_BYTES } from "../types/attachment.types.js";

/**
 * Prefixo: /api/transactions — anexos de uma transação (R24, R25, R76). O multipart é registrado
 * só neste plugin (encapsulado): as outras rotas continuam aceitando apenas JSON (ADR-S2-009).
 */
export function attachmentRoutes(controller: AttachmentController, guards: HttpGuards): FastifyPluginAsyncZod {
  return async (app) => {
    await app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 } });
    app.addHook("onRequest", guards.authenticate);

    app.get("/:id/attachments", { schema: schemas.list }, controller.list);
    app.post("/:id/attachments", { schema: schemas.upload, bodyLimit: MAX_ATTACHMENT_BYTES + 1_048_576 }, controller.upload);
    // Imagem e PDF já são comprimidos: sem compressão de novo no download.
    app.get("/:id/attachments/:attachmentId/content", { schema: schemas.download, compress: false }, controller.download);
    app.delete("/:id/attachments/:attachmentId", { schema: schemas.remove }, controller.remove);
  };
}
