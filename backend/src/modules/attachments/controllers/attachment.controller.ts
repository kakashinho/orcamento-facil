import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import type { attachmentRouteSchemas } from "../schemas/attachment.schema.js";
import { type AttachmentService, fileTooLarge } from "../services/attachment.service.js";
import { MAX_ATTACHMENT_BYTES, type UploadedFile } from "../types/attachment.types.js";

type Schemas = typeof attachmentRouteSchemas;

/** Erros do leitor de multipart no formato da API (413, 415, 400). */
function multipartError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === "FST_REQ_FILE_TOO_LARGE") return fileTooLarge();
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
    return new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Envie o arquivo como multipart/form-data, no campo `file`.");
  }
  if (code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT") {
    return errors.invalidField("file", "Envie um único arquivo, no campo `file`.");
  }
  return error;
}

export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.attachments.list(requireAuth(request).userId, request.params.id));
  };

  upload = async (request: ZodRequest<Schemas["upload"]>, reply: ZodReply<Schemas["upload"]>) => {
    const { userId } = requireAuth(request);
    let file: UploadedFile;
    try {
      const part = await request.file({ limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });
      if (!part || part.fieldname !== "file") throw errors.invalidField("file", "Envie o arquivo no campo `file`.");
      const content = await part.toBuffer();
      // Dependendo de como os pedaços chegam pela rede, o leitor termina sem acusar o limite: um arquivo
      // um pouco maior que 5 MB seria gravado cortado. Conferir a marca de corte depois da leitura evita isso.
      if (part.file.truncated) throw fileTooLarge();
      file = { fileName: part.filename, content };
    } catch (error) {
      throw multipartError(error);
    }
    return reply.status(201).send(await this.attachments.upload(userId, request.params.id, file, request.query.kind));
  };

  download = async (request: ZodRequest<Schemas["download"]>, reply: ZodReply<Schemas["download"]>) => {
    const { id, attachmentId } = request.params;
    const file = await this.attachments.download(requireAuth(request).userId, id, attachmentId);
    return reply
      .header("content-type", file.mimeType)
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
      .send(file.content);
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    const { id, attachmentId } = request.params;
    await this.attachments.remove(requireAuth(request).userId, id, attachmentId);
    return reply.status(204).send();
  };
}
