import type { AttachmentMimeType } from "../types/attachment.types.js";

/**
 * Tipo real do arquivo pelos primeiros bytes (assinatura), não pelo nome nem pelo `Content-Type`
 * que o cliente declara: um ".pdf" que é texto não passa (ADR-S2-009).
 */
export function detectMime(content: Buffer): AttachmentMimeType | null {
  if (content.length >= 5 && content.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString("latin1") === "RIFF" &&
    content.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS: Record<AttachmentMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Nome de exibição seguro: sem caminho nem caracteres de controle, até 120 caracteres. */
export function safeFileName(raw: string | undefined, mime: AttachmentMimeType): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  if (cleaned === "") return `anexo.${EXTENSIONS[mime]}`;
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - extension.length) + extension;
}
