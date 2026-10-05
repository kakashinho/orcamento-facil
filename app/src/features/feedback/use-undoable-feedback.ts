import { useCallback } from "react";
import { errorMessage } from "@/core/http/api-error";
import { logger } from "@/core/logging/logger";
import { useUndo } from "@/data/queries/finance";
import { useFeedback } from "./feedback-provider";

/**
 * Snackbar com "Desfazer" depois de editar, excluir ou arquivar (R49). A reversão é feita pelo
 * servidor (POST /api/history/undo), que recompõe saldos e devolve o que foi desfeito.
 */
export function useUndoableFeedback() {
  const { showSnackbar } = useFeedback();
  const undo = useUndo();

  return useCallback(
    (message: string) => {
      showSnackbar({
        message,
        actionLabel: "Desfazer",
        onAction: () => {
          undo.mutate(undefined, {
            onSuccess: (result) => {
              logger.info("history.undone", { action: result.undone.action });
              showSnackbar(`Desfeito: ${result.undone.label.toLowerCase()}`);
            },
            onError: (error) => showSnackbar(errorMessage(error, "Não foi possível desfazer.")),
          });
        },
      });
    },
    [showSnackbar, undo],
  );
}
