import { Directory, Paths } from "expo-file-system";
import { logger } from "../logging/logger";

/** PDFs e imagens que o app grava no cache: anexos abertos, extratos, fotos e cartões compartilhados. */
const TEMP_FILE = /\.(pdf|jpe?g|png|webp)$/i;

/**
 * Apaga do cache do app, em todas as subpastas, os PDFs e imagens deixados por anexos abertos (R24, R25),
 * extratos (R41), fotos da câmera e cartões compartilhados (R30). Esses arquivos ficam sem cifra no
 * aparelho (o servidor guarda os anexos cifrados), então não devem sobreviver ao uso (R81). Roda ao abrir
 * o app logado e ao sair da conta; o cache é descartável, e nada aqui é dado do usuário. Devolve quantos
 * arquivos removeu; falhas isoladas só vão para o log.
 */
export function purgeTempFiles(root: Directory = Paths.cache): number {
  let entries: ReturnType<Directory["list"]>;
  try {
    entries = root.list();
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    try {
      if (entry instanceof Directory) removed += purgeTempFiles(entry);
      else if (TEMP_FILE.test(entry.name)) {
        entry.delete();
        removed += 1;
      }
    } catch (error) {
      logger.warn("files.purge_failed", { reason: error instanceof Error ? error.name : "UNKNOWN" });
    }
  }
  return removed;
}
