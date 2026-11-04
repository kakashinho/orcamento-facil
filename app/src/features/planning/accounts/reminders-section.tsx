import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { Reminder } from "@/data/api/types";
import { useReminders, useUpdateReminder } from "@/data/queries/notifications";
import { useMaintenance } from "@/data/system/maintenance-store";
import { todayIso } from "@/domain/dates";
import { Divider, Icon, Switch, Text, useTheme, withAlpha } from "@/ui";
import { SectionCard } from "../../analytics/components/section-card";
import { useFeedback } from "../../feedback/feedback-provider";
import { ItemAvatar } from "../components/state-badge";
import { reminderSummary } from "./account-labels";

/**
 * Lembretes de contas (R34): título, próximo vencimento, frequência, valor e o interruptor
 * ativo/pausado. Tocar no lembrete abre a edição (e a exclusão).
 */
export function RemindersSection({ onEdit }: { onEdit: (reminder: Reminder) => void }) {
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const reminders = useReminders();
  const update = useUpdateReminder();
  const today = todayIso();

  const toggle = (reminder: Reminder, active: boolean) =>
    update.mutate(
      { id: reminder.id, body: { active } },
      {
        onSuccess: () => showSnackbar(active ? "Lembrete reativado" : "Lembrete pausado"),
        onError: (error) => showSnackbar(errorMessage(error)),
      },
    );

  const list = [...(reminders.data ?? [])].sort((a, b) =>
    a.active === b.active ? a.nextDueDate.localeCompare(b.nextDueDate) : a.active ? -1 : 1,
  );

  return (
    <SectionCard
      title="Lembretes de contas"
      testID="reminders-section"
      loading={reminders.isPending}
      error={reminders.error}
      onRetry={() => void reminders.refetch()}
    >
      {list.length === 0 ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Nenhum lembrete. Crie um para ser avisado no dia do vencimento de contas como aluguel e luz.
        </Text>
      ) : (
        list.map((reminder, index) => (
          <View key={reminder.id}>
            {index > 0 ? <Divider /> : null}
            <ReminderRow
              reminder={reminder}
              today={today}
              disabled={maintenance.active}
              onPress={() => onEdit(reminder)}
              onToggle={(active) => toggle(reminder, active)}
            />
          </View>
        ))
      )}
    </SectionCard>
  );
}

function ReminderRow({
  reminder,
  today,
  disabled,
  onPress,
  onToggle,
}: {
  reminder: Reminder;
  today: string;
  disabled: boolean;
  onPress: () => void;
  onToggle: (active: boolean) => void;
}) {
  const { colors } = useTheme();
  const summary = reminder.active ? reminderSummary(reminder, today) : `Pausado · ${reminderSummary(reminder, today)}`;
  return (
    <View style={styles.row} testID={`reminder-${reminder.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${reminder.title}: ${summary}`}
        accessibilityHint="Editar lembrete"
        onPress={onPress}
        android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
        style={styles.main}
      >
        <ItemAvatar color={reminder.active ? undefined : colors.surfaceVariant}>
          <Icon
            name={reminder.active ? "notifications_active" : "notifications_off"}
            size={20}
            color={reminder.active ? "onSecondaryContainer" : "onSurfaceVariant"}
          />
        </ItemAvatar>
        <View style={styles.body}>
          <Text weight="medium" numberOfLines={1} color={reminder.active ? "onSurface" : "onSurfaceVariant"}>
            {reminder.title}
          </Text>
          <Text variant="label" color="onSurfaceVariant">
            {summary}
          </Text>
        </View>
      </Pressable>
      <Switch
        value={reminder.active}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityLabel={`Lembrete ${reminder.title} ativo`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  body: { flex: 1, minWidth: 0 },
});
