import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { logger } from "@/core/logging/logger";
import type { Attachment } from "@/data/api/types";
import { api, http } from "@/data/client";
import { cacheFileName } from "@/domain/attachments";

/**
 * Abre um anexo (R24, R25, R76): baixa para o cache do app só quando o usuário toca (R86), com o
 * cabeçalho de autorização renovado antes (o download é feito fora do cliente HTTP), e mostra a
 * folha do Android para visualizar, salvar ou enviar.
 */
export async function openAttachment(transactionId: string, attachment: Attachment): Promise<void> {
  const headers = await http.authHeaders();
  const destination = new File(Paths.cache, cacheFileName(attachment));
  const file = await File.downloadFileAsync(api.attachments.contentUrl(transactionId, attachment.id), destination, {
    headers,
    idempotent: true,
  });
  logger.info("attachments.downloaded", { kind: attachment.kind, mimeType: attachment.mimeType });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartilhamento indisponível neste aparelho.");
  await Sharing.shareAsync(file.uri, { mimeType: attachment.mimeType, dialogTitle: attachment.fileName });
}
