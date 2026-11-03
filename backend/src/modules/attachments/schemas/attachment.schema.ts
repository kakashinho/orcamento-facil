import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, responseId, responseTimestamp, secured, uuid } from "../../../infrastructure/http/common-schemas.js";
import { ATTACHMENT_KINDS, ATTACHMENT_MIME_TYPES } from "../types/attachment.types.js";

const TAGS = ["Anexos"];

const kind = z
  .enum(ATTACHMENT_KINDS)
  .meta({ description: "photo = foto pela câmera (R24); document = arquivo (R25); receipt = comprovante de pagamento (R76)" });

// ---------- Request DTOs ----------

export const uploadAttachmentQuerySchema = z.strictObject({ kind: kind.default("document") });
export type UploadAttachmentQueryDto = z.infer<typeof uploadAttachmentQuerySchema>;

export const attachmentParams = z.strictObject({ id: uuid(), attachmentId: uuid() });

// ---------- Response DTOs ----------

export const attachmentResponseSchema = z
  .object({
    id: responseId,
    kind,
    fileName: z.string(),
    mimeType: z.enum(ATTACHMENT_MIME_TYPES),
    sizeBytes: z.number(),
    createdAt: responseTimestamp,
  })
  .meta({ id: "Attachment" });
export type AttachmentResponseDto = z.infer<typeof attachmentResponseSchema>;

export const attachmentListResponseSchema = z.object({ data: z.array(attachmentResponseSchema) });
export type AttachmentListResponseDto = z.infer<typeof attachmentListResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const attachmentRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Anexos da transação (R25)",
    description: "Transação excluída: 404 (os anexos voltam se a exclusão for desfeita).",
    security: secured,
    params: idParams,
    response: { 200: attachmentListResponseSchema },
  },
  upload: {
    tags: TAGS,
    summary: "Anexar foto, documento ou comprovante (R24, R25, R76)",
    description:
      "Corpo multipart/form-data com um arquivo no campo `file` (PDF, JPEG, PNG ou WebP, até 5 MB; o tipo é conferido pelo conteúdo). Até 10 anexos por transação e 100 MB por usuário. O arquivo é guardado cifrado.",
    security: secured,
    consumes: ["multipart/form-data"],
    params: idParams,
    querystring: uploadAttachmentQuerySchema,
    response: { 201: attachmentResponseSchema },
  },
  download: {
    tags: TAGS,
    summary: "Baixar o anexo",
    description: "Devolve o arquivo original, com o tipo e o nome dele (Content-Disposition: attachment).",
    security: secured,
    params: attachmentParams,
    produces: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
  remove: {
    tags: TAGS,
    summary: "Excluir o anexo",
    description: "Definitivo (não entra no desfazer).",
    security: secured,
    params: attachmentParams,
  },
} satisfies Record<string, FastifySchema>;
