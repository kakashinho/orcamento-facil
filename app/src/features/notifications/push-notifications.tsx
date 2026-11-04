import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { session } from "@/data/client";
import { useMarkNotificationRead } from "@/data/queries/notifications";
import { Button, Dialog } from "@/ui";
import {
  isPushAvailable,
  onNotificationReceived,
  onNotificationResponse,
  onTokenChange,
  takeLastNotificationResponse,
  type PushResponse,
} from "./native-notifications";
import { notificationTarget, parsePushData } from "./notification-target";
import {
  enablePush,
  markPermissionOffered,
  pushPermissionKey,
  registerPushDevice,
  shouldOfferPermission,
  unregisterPushDevice,
} from "./push-registration";
import { useOpenNotificationTarget } from "./use-open-notification";

/** Toques já tratados: o mesmo toque pode chegar pelo ouvinte e pela resposta que abriu o app. */
const handledResponses = new Set<string>();

/**
 * Push no aparelho (R18), ativo enquanto há sessão: registra o aparelho ao entrar e na restauração da
 * sessão, registra de novo quando o FCM troca o token, descadastra no "Sair" (antes de revogar a sessão),
 * atualiza o sino quando chega um aviso com o app aberto e, no toque, marca como lido e abre a tela da
 * entidade. Na primeira vez, explica o motivo antes do pedido de permissão do sistema.
 */
export function PushNotifications() {
  const queryClient = useQueryClient();
  const openTarget = useOpenNotificationTarget();
  const { mutate: markRead } = useMarkNotificationRead();
  const [offer, setOffer] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const onTap = useRef<(response: PushResponse) => void>(() => undefined);

  useEffect(() => {
    onTap.current = (response) => {
      if (handledResponses.has(response.id)) return;
      handledResponses.add(response.id);
      const data = parsePushData(response.data);
      if (data.notificationId) markRead(data.notificationId);
      void openTarget(notificationTarget(data));
    };
  }, [openTarget, markRead]);

  useEffect(() => {
    if (!isPushAvailable()) return;
    let active = true;
    void registerPushDevice().then(async (id) => {
      if (!id && active && (await shouldOfferPermission()) && active) setOffer(true);
    });
    void takeLastNotificationResponse()
      .then((response) => {
        if (response && active) onTap.current(response);
      })
      .catch(() => undefined);
    const stops = [
      onTokenChange((token) => void registerPushDevice(token)),
      onNotificationResponse((response) => onTap.current(response)),
      onNotificationReceived(() => void queryClient.invalidateQueries({ queryKey: ["notifications"] })),
      session.onBeforeSignOut(unregisterPushDevice),
    ];
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [queryClient]);

  const dismiss = () => {
    setOffer(false);
    void markPermissionOffered();
  };

  const allow = async () => {
    setEnabling(true);
    await enablePush();
    setEnabling(false);
    setOffer(false);
    void queryClient.invalidateQueries({ queryKey: pushPermissionKey });
  };

  return (
    <Dialog
      open={offer}
      onClose={dismiss}
      title="Quer receber lembretes e alertas?"
      icon="notifications_active"
      testID="push-permission-offer"
      actions={
        <>
          <Button variant="text" label="Agora não" onPress={dismiss} />
          <Button label="Permitir" loading={enabling} onPress={() => void allow()} />
        </>
      }
    >
      Avisamos quando um orçamento chegar perto do limite, o saldo de uma carteira ficar abaixo do mínimo, uma meta
      estiver perto da data e na hora do lembrete diário. Dá para mudar isso nas Preferências.
    </Dialog>
  );
}
