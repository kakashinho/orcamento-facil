import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { AttachmentRepository } from "../repositories/attachment.repository.js";
import type { AttachmentListResponseDto, AttachmentResponseDto } from "../schemas/attachment.schema.js";
import {
  type AttachmentKind,
  type AttachmentRecord,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TRANSACTION,
  type UploadedFile,
} from "../types/attachment.types.js";
import { detectMime, safeFileName } from "./file-signature.js";

export interface AttachmentServiceDeps {
  attachments: AttachmentRepository;
  transactions: TransactionService;
  clock: Clock;
  /** Cota de anexos por usuário (100 MB). */
  quotaBytes: number;
}

function toDto(record: AttachmentRecord): AttachmentResponseDto {
  return {
    id: record.id,
    kind: record.kind,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Anexos das transações (R24, R25, R76), cifrados no banco. Só existem para
 * transações ativas: a transação excluída esconde os anexos, e o desfazer os traz de volta.
 */
export class AttachmentService {
  constructor(private readonly deps: AttachmentServiceDeps) {}

  /** A transação precisa ser do usuário e estar ativa (senão 404, como nas rotas de transação). */
  private async assertTransaction(userId: string, transactionId: string): Promise<void> {
    await this.deps.transactions.get(userId, transactionId);
  }

  async upload(userId: string, transactionId: string, file: UploadedFile, kind: AttachmentKind): Promise<AttachmentResponseDto> {
    const { attachments, clock, quotaBytes } = this.deps;
    await this.assertTransaction(userId, transactionId);
    if (file.content.length === 0) throw errors.invalidField("file", "O arquivo está vazio.");
    if (file.content.length > MAX_ATTACHMENT_BYTES) throw fileTooLarge();
    const mimeType = detectMime(file.content);
    if (!mimeType) {
      throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "Envie um PDF ou uma imagem (JPEG, PNG ou WebP).");
    }
    if ((await attachments.countByTransaction(transactionId)) >= MAX_ATTACHMENTS_PER_TRANSACTION) {
      throw errors.conflict("ATTACHMENT_LIMIT", `Cada transação aceita até ${MAX_ATTACHMENTS_PER_TRANSACTION} anexos.`);
    }
    if ((await attachments.usedBytes(userId)) + file.content.length > quotaBytes) {
      throw errors.conflict(
        "ATTACHMENT_QUOTA",
        `O espaço para anexos (${Math.round(quotaBytes / 1024 / 1024)} MB) acabou. Exclua anexos antigos para liberar espaço.`,
      );
    }
    const record: AttachmentRecord = {
      id: randomUUID(),
      userId,
      transactionId,
      kind,
      fileName: safeFileName(file.fileName, mimeType),
      mimeType,
      sizeBytes: file.content.length,
      createdAt: clock.now(),
    };
    await attachments.insert(record, file.content);
    return toDto(record);
  }

  async list(userId: string, transactionId: string): Promise<AttachmentListResponseDto> {
    await this.assertTransaction(userId, transactionId);
    return { data: (await this.deps.attachments.list(userId, transactionId)).map(toDto) };
  }

  async download(userId: string, transactionId: string, attachmentId: string) {
    await this.assertTransaction(userId, transactionId);
    const found = await this.deps.attachments.findWithContent(userId, transactionId, attachmentId);
    if (!found) throw errors.notFound("Anexo");
    return { fileName: found.record.fileName, mimeType: found.record.mimeType, content: found.content };
  }

  async remove(userId: string, transactionId: string, attachmentId: string): Promise<void> {
    await this.assertTransaction(userId, transactionId);
    if (!(await this.deps.attachments.delete(userId, transactionId, attachmentId))) throw errors.notFound("Anexo");
  }
}

export function fileTooLarge(): AppError {
  return new AppError(413, "FILE_TOO_LARGE", "O arquivo passa de 5 MB. Envie um arquivo menor.");
}
