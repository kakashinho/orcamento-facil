import { useRouter } from "expo-router";
import { useCallback } from "react";
import { errorMessage } from "@/core/http/api-error";
import { api } from "@/data/client";
import { useFeedback } from "../feedback/feedback-provider";
import { useAppSheets } from "../shell/app-sheets";
import type { NotificationTarget } from "./notification-target";

/**
 * Abre o destino de um aviso (R22, R47, R68, R78, R18, R34): navega para a tela da entidade, mostra os
 * detalhes da transação (buscada pelo id) ou abre o formulário de nova transação (lembrete diário).
 */
export function useOpenNotificationTarget() {
  const router = useRouter();
  const { openTransactionDetails, openTransactionForm } = useAppSheets();
  const { showSnackbar } = useFeedback();

  return useCallback(
    async (target: NotificationTarget | null) => {
      if (!target) return;
      if (target.type === "route") {
        router.navigate(target.href);
        return;
      }
      if (target.type === "newTransaction") {
        openTransactionForm();
        return;
      }
      try {
        openTransactionDetails(await api.transactions.get(target.id));
      } catch (error) {
        showSnackbar(errorMessage(error, "Não foi possível abrir a transação."));
      }
    },
    [router, openTransactionDetails, openTransactionForm, showSnackbar],
  );
}
