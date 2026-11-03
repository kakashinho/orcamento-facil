export const ATTACHMENT_KINDS = ["photo", "document", "receipt"] as const;
/** photo = câmera (R24); document = arquivo (R25); receipt = comprovante de pagamento (R76). */
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** Limites (D-70). */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TRANSACTION = 10;

export interface AttachmentRecord {
  id: string;
  userId: string;
  transactionId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
  createdAt: Date;
}

export interface UploadedFile {
  fileName: string;
  content: Buffer;
}
