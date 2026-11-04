import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { NotificationSettings } from "@/data/api/types";
import { useNotificationSettings, useUpdateNotificationSettings } from "@/data/queries/notifications";
import { Banner, Button, IconButton, Skeleton, Switch, Text, type IconName } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { getPermission, type PushPermission } from "../notifications/native-notifications";
import { enablePush, pushPermissionKey, registerPushDevice } from "../notifications/push-registration";
import { Row, Section } from "./preference-rows";

const PERMISSION: Record<PushPermission, { icon: IconName; subtitle: string }> = {
  granted: { icon: "notifications_active", subtitle: "Permitidas neste aparelho" },
  askable: { icon: "notifications", subtitle: "Permita para receber os avisos mesmo com o app fechado" },
  blocked: { icon: "notifications_off", subtitle: "Bloqueadas nas configurações do Android" },
  unavailable: { icon: "notifications_off", subtitle: "Disponível no app instalado (o Expo Go não recebe push)" },
};

/** 20 → "20:00". */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Preferências › Notificações (R18, R34): estado da permissão do sistema (pedir ou abrir as configurações),
 * lembrete diário com horário, vencimento de metas, contas a vencer e alertas por push. As opções ficam no
 * servidor (`PATCH /api/notifications/settings`) e valem em todos os aparelhos.
 */
export function NotificationsSection() {
  const queryClient = useQueryClient();
  const { showSnackbar } = useFeedback();
  // Relida ao voltar ao app: a pessoa pode ter liberado a permissão nas configurações do sistema.
  const permission = useQuery({ queryKey: pushPermissionKey, queryFn: getPermission, staleTime: 0 });
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const [enabling, setEnabling] = useState(false);
  const previous = useRef<PushPermission | undefined>(undefined);

  // Liberada fora do app (configurações do Android): registra o aparelho para começar a receber.
  useEffect(() => {
    if (previous.current && previous.current !== "granted" && permission.data === "granted") {
      void registerPushDevice();
    }
    previous.current = permission.data;
  }, [permission.data]);

  const save = (patch: Partial<NotificationSettings>) =>
    update.mutate(patch, { onError: (error) => showSnackbar(errorMessage(error)) });

  const allow = async () => {
    setEnabling(true);
    const result = await enablePush();
    setEnabling(false);
    previous.current = result;
    queryClient.setQueryData(pushPermissionKey, result);
    if (result === "granted") showSnackbar("Notificações ativadas neste aparelho");
    else if (result === "blocked") showSnackbar("Permissão negada. Dá para liberar nas configurações do Android.");
  };

  const state = permission.data;
  const current = settings.data;
  const hour = current?.dailyReminderHour ?? 20;

  return (
    <Section title="Notificações" testID="notifications-section">
      <Row
        icon={state ? PERMISSION[state].icon : "notifications"}
        title="Notificações no aparelho"
        subtitle={state ? PERMISSION[state].subtitle : "Verificando…"}
      >
        {null}
      </Row>
      {state === "askable" ? (
        <Button
          variant="tonal"
          icon="notifications_active"
          label="Permitir notificações"
          loading={enabling}
          onPress={() => void allow()}
          style={styles.action}
        />
      ) : null}
      {state === "blocked" ? (
        <Button
          variant="outlined"
          icon="settings"
          label="Abrir configurações"
          onPress={() => void Linking.openSettings().catch(() => undefined)}
          style={styles.action}
        />
      ) : null}

      {settings.isPending ? (
        <View style={styles.loading}>
          <Skeleton style={styles.skeleton} />
          <Skeleton style={styles.skeleton} />
        </View>
      ) : !current ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(settings.error, "Não foi possível carregar as preferências de aviso.")}
        </Banner>
      ) : (
        <>
          <Row icon="alarm" title="Lembrete diário" subtitle="Para registrar as despesas do dia">
            <Switch
              value={current.dailyReminderEnabled}
              onValueChange={(value) => save({ dailyReminderEnabled: value })}
              accessibilityLabel="Lembrete diário"
            />
          </Row>
          {current.dailyReminderEnabled ? (
            <View style={styles.hourRow}>
              <Text variant="label" color="onSurfaceVariant" style={styles.flex}>
                Horário do lembrete
              </Text>
              <IconButton
                name="chevron_left"
                accessibilityLabel="Lembrar uma hora mais cedo"
                onPress={() => save({ dailyReminderHour: (hour + 23) % 24 })}
              />
              <Text
                mono
                weight="medium"
                accessibilityLabel={`Horário do lembrete: ${formatHour(hour)}`}
                testID="daily-reminder-hour"
              >
                {formatHour(hour)}
              </Text>
              <IconButton
                name="chevron_right"
                accessibilityLabel="Lembrar uma hora mais tarde"
                onPress={() => save({ dailyReminderHour: (hour + 1) % 24 })}
              />
            </View>
          ) : null}
          <Row icon="flag" title="Vencimento de metas" subtitle="Aviso quando uma meta estiver perto da data limite">
            <Switch
              value={current.goalRemindersEnabled}
              onValueChange={(value) => save({ goalRemindersEnabled: value })}
              accessibilityLabel="Vencimento de metas"
            />
          </Row>
          <Row icon="event_upcoming" title="Contas a vencer" subtitle="Lembrete no dia do vencimento das contas">
            <Switch
              value={current.billRemindersEnabled}
              onValueChange={(value) => save({ billRemindersEnabled: value })}
              accessibilityLabel="Contas a vencer"
            />
          </Row>
          <Row
            icon="notifications_active"
            title="Alertas por push"
            subtitle="Orçamento, saldo mínimo e metas também no aparelho; na caixa de avisos eles sempre aparecem"
          >
            <Switch
              value={current.alertsPushEnabled}
              onValueChange={(value) => save({ alertsPushEnabled: value })}
              accessibilityLabel="Alertas por push"
            />
          </Row>
        </>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { alignSelf: "flex-start" },
  loading: { gap: 8 },
  skeleton: { height: 44 },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 34 },
});
