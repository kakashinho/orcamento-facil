import { and, count, desc, eq, sql } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { transactionAttachments } from "../../../infrastructure/database/schema.js";
import type { AttachmentKind, AttachmentMimeType, AttachmentRecord } from "../types/attachment.types.js";

const metadata = {
  id: transactionAttachments.id,
  userId: transactionAttachments.userId,
  transactionId: transactionAttachments.transactionId,
  kind: transactionAttachments.kind,
  fileName: transactionAttachments.fileName,
  mimeType: transactionAttachments.mimeType,
  sizeBytes: transactionAttachments.sizeBytes,
  createdAt: transactionAttachments.createdAt,
};

type MetadataRow = { [K in keyof typeof metadata]: (typeof transactionAttachments.$inferSelect)[K] };

function toRecord(row: MetadataRow): AttachmentRecord {
  return { ...row, kind: row.kind as AttachmentKind, mimeType: row.mimeType as AttachmentMimeType };
}

/** Anexos (R24, R25, R76). O conteúdo é cifrado inteiro (R81); a listagem não o lê. */
export class AttachmentRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  async insert(record: AttachmentRecord, content: Buffer): Promise<void> {
    await this.db.insert(transactionAttachments).values({
      ...record,
      content: this.cipher.encrypt(content, aad.attachmentContent(record.id)),
    });
  }

  async countByTransaction(transactionId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, transactionId));
    return row?.value ?? 0;
  }

  /** Espaço ocupado pelo usuário, em bytes (cota — D-70). */
  async usedBytes(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(sum(${transactionAttachments.sizeBytes}), 0)::bigint` })
      .from(transactionAttachments)
      .where(eq(transactionAttachments.userId, userId));
    return Number(row?.value ?? 0);
  }

  async list(userId: string, transactionId: string): Promise<AttachmentRecord[]> {
    const rows = await this.db
      .select(metadata)
      .from(transactionAttachments)
      .where(and(eq(transactionAttachments.userId, userId), eq(transactionAttachments.transactionId, transactionId)))
      .orderBy(desc(transactionAttachments.createdAt));
    return rows.map(toRecord);
  }

  async findWithContent(
    userId: string,
    transactionId: string,
    attachmentId: string,
  ): Promise<{ record: AttachmentRecord; content: Buffer } | undefined> {
    const [row] = await this.db
      .select({ ...metadata, content: transactionAttachments.content })
      .from(transactionAttachments)
      .where(
        and(
          eq(transactionAttachments.id, attachmentId),
          eq(transactionAttachments.userId, userId),
          eq(transactionAttachments.transactionId, transactionId),
        ),
      );
    if (!row) return undefined;
    const { content, ...rest } = row;
    return { record: toRecord(rest), content: this.cipher.decrypt(content, aad.attachmentContent(row.id)) };
  }

  async delete(userId: string, transactionId: string, attachmentId: string): Promise<boolean> {
    const result = await this.db
      .delete(transactionAttachments)
      .where(
        and(
          eq(transactionAttachments.id, attachmentId),
          eq(transactionAttachments.userId, userId),
          eq(transactionAttachments.transactionId, transactionId),
        ),
      );
    return (result.rowCount ?? 0) > 0;
  }
}
