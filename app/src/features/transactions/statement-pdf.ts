import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { logger } from "@/core/logging/logger";
import type { PeriodQuery } from "@/data/api/types";
import { api, http } from "@/data/client";

export function statementFileName(query: PeriodQuery): string {
  return `extrato_${query.from}_a_${query.to}.pdf`;
}

/**
 * Baixa o PDF do extrato gerado pelo servidor (R41) para o cache do app. O token é renovado
 * antes, porque o download é feito pelo sistema de arquivos, fora do cliente HTTP.
 */
export async function downloadStatementPdf(query: PeriodQuery): Promise<{ uri: string; name: string }> {
  const name = statementFileName(query);
  const headers = await http.authHeaders();
  const destination = new File(Paths.cache, name);
  const file = await File.downloadFileAsync(api.reports.statementPdfUrl(query), destination, {
    headers,
    idempotent: true,
  });
  logger.info("reports.statement_pdf_downloaded", { from: query.from, to: query.to });
  return { uri: file.uri, name };
}

/** Abre a folha do Android para visualizar, salvar ou enviar o PDF. */
export async function sharePdf(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartilhamento indisponível neste aparelho.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Extrato em PDF", UTI: "com.adobe.pdf" });
}
