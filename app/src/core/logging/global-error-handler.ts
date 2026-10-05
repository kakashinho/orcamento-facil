import type { Logger } from "./logger";

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/**
 * Registra no logger todo erro JavaScript não tratado (R85) antes de repassá-lo ao
 * tratador padrão do React Native. Devolve a função que desfaz a instalação.
 */
export function installGlobalErrorHandler(logger: Logger, errorUtils?: ErrorUtilsLike): () => void {
  const utils = errorUtils ?? (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return () => undefined;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    logger.error(isFatal ? "app.fatal_error" : "app.unhandled_error", error, { fatal: !!isFatal });
    previous(error, isFatal);
  });
  return () => utils.setGlobalHandler(previous);
}
