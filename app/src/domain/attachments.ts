import type { Attachment, AttachmentKind, AttachmentMimeType } from "@/data/api/types";
import type { IconName } from "@/ui";

/**
 * Anexos das transações: fotos (R24), documentos (R25) e comprovantes de pagamento (R76).
 * Mesmos limites do servidor, conferidos no aparelho antes do envio para não gastar dados (R86).
 */

export const ACCEPTED_MIME_TYPES: readonly AttachmentMimeType[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** 5 MB por arquivo. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Anexos por transação. */
export const MAX_ATTACHMENTS = 10;

/** Lado maior da foto depois de reduzida, em pixels. */
export const PHOTO_MAX_SIDE = 1600;

/** Compressão JPEG da foto reduzida (0 a 1). */
export const PHOTO_QUALITY = 0.7;

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  photo: "Foto",
  document: "Documento",
  receipt: "Comprovante",
};

const EXTENSIONS: Record<string, AttachmentMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Tipo do arquivo escolhido: o informado pelo sistema, se aceito, ou o da extensão; null se não for aceito. */
export function mimeTypeOf(name: string, declared?: string | null): AttachmentMimeType | null {
  const normalized = declared?.toLowerCase() === "image/jpg" ? "image/jpeg" : declared?.toLowerCase();
  const accepted = ACCEPTED_MIME_TYPES.find((type) => type === normalized);
  if (accepted) return accepted;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONS[extension] ?? null;
}

/** Confere tipo e tamanho antes do upload; devolve a mensagem de erro ou null. */
export function validateLocalFile(file: {
  name: string;
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  if (!mimeTypeOf(file.name, file.mimeType)) return "Envie um PDF ou uma imagem (JPEG, PNG ou WebP).";
  if (file.size === 0) return "O arquivo está vazio.";
  if (typeof file.size === "number" && file.size > MAX_ATTACHMENT_BYTES) {
    return "O arquivo passa de 5 MB. Envie um arquivo menor.";
  }
  return null;
}

/** Tamanho legível: "820 B", "48 KB", "1,2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace(".", ",")} MB`;
}

/** Ícone da linha do anexo. */
export function attachmentIcon(attachment: Pick<Attachment, "kind" | "mimeType">): IconName {
  if (attachment.kind === "receipt") return "receipt";
  if (attachment.mimeType === "application/pdf") return "picture_as_pdf";
  return attachment.kind === "photo" ? "photo_camera" : "image";
}

/** Nome do arquivo no cache do aparelho ao abrir (único por anexo, sem caracteres problemáticos). */
export function cacheFileName(attachment: Pick<Attachment, "id" | "fileName">): string {
  const safe = attachment.fileName.replace(/[^\w.\-]+/g, "_").slice(-80) || "anexo";
  return `${attachment.id.slice(0, 8)}_${safe}`;
}

/** Nova dimensão para que o lado maior fique em `max` px; null se a foto já for menor. */
export function photoResize(
  width: number,
  height: number,
  max: number = PHOTO_MAX_SIDE,
): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

/** "foto_2026-11-04_153012.jpg". */
export function photoFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `foto_${date}_${time}.jpg`;
}

/** Mensagens amigáveis para os erros do upload (413, 415, 409); null = usar a do servidor. */
export function attachmentErrorMessage(code: string): string | null {
  switch (code) {
    case "FILE_TOO_LARGE":
      return "O arquivo passa de 5 MB. Envie um arquivo menor.";
    case "UNSUPPORTED_FILE_TYPE":
    case "UNSUPPORTED_MEDIA_TYPE":
      return "Formato não aceito. Envie um PDF ou uma imagem (JPEG, PNG ou WebP).";
    case "ATTACHMENT_LIMIT":
      return `Esta transação já tem ${MAX_ATTACHMENTS} anexos. Exclua um para anexar outro.`;
    case "ATTACHMENT_QUOTA":
      return "O espaço para anexos acabou. Exclua anexos antigos para liberar espaço.";
    default:
      return null;
  }
}
