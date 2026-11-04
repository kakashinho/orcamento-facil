import { Pressable, StyleSheet, View } from "react-native";
import type { AppNotification, NotificationKind } from "@/data/api/types";
import { Icon, radii, Text, useTheme, withAlpha, type IconName, type Palette } from "@/ui";
import { relativeTime } from "./relative-time";

type Tone = "alert" | "warning" | "success" | "reminder";

/** Ícone e cor de cada tipo de aviso (R22, R47, R68, R78, R18, R34). */
const KIND_STYLE: Record<NotificationKind, { icon: IconName; tone: Tone }> = {
  budget_warning: { icon: "warning", tone: "warning" },
  budget_exceeded: { icon: "error", tone: "alert" },
  daily_limit_exceeded: { icon: "today", tone: "alert" },
  reduction_exceeded: { icon: "trending_up", tone: "alert" },
  unusual_transaction: { icon: "insights", tone: "warning" },
  low_balance: { icon: "account_balance_wallet", tone: "alert" },
  goal_achieved: { icon: "celebration", tone: "success" },
  goal_deadline: { icon: "flag", tone: "warning" },
  daily_reminder: { icon: "alarm", tone: "reminder" },
  bill_reminder: { icon: "event_upcoming", tone: "reminder" },
};

export function kindIcon(kind: NotificationKind): IconName {
  return KIND_STYLE[kind]?.icon ?? "notifications";
}

function toneColors(tone: Tone, colors: Palette) {
  switch (tone) {
    case "alert":
      return { bg: colors.errorContainer, fg: colors.onErrorContainer };
    case "warning":
      return { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer };
    case "success":
      return { bg: colors.primaryContainer, fg: colors.onPrimaryContainer };
    default:
      return { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer };
  }
}

/** Linha da caixa de notificações: não lidas com fundo e ponto de destaque. */
export function NotificationRow({
  notification,
  onPress,
  now,
}: {
  notification: AppNotification;
  onPress: (notification: AppNotification) => void;
  now?: Date;
}) {
  const { colors } = useTheme();
  const unread = !notification.readAt;
  const style = KIND_STYLE[notification.kind] ?? { icon: "notifications" as const, tone: "reminder" as const };
  const tone = toneColors(style.tone, colors);
  const when = relativeTime(notification.createdAt, now);
  return (
    <Pressable
      testID={`notification-${notification.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? "Não lida. " : ""}${notification.title}. ${notification.body}. ${when}`}
      onPress={() => onPress(notification)}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={[styles.row, unread && { backgroundColor: withAlpha(colors.primaryContainer, 0.45) }]}
    >
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Icon name={style.icon} size={20} color={tone.fg} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text weight={unread ? "bold" : "medium"} numberOfLines={2} style={styles.title}>
            {notification.title}
          </Text>
          <Text variant="caption" color="onSurfaceVariant">
            {when}
          </Text>
        </View>
        <Text variant="bodySmall" color="onSurfaceVariant" numberOfLines={3}>
          {notification.body}
        </Text>
      </View>
      {unread ? <View testID="unread-dot" style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  icon: { width: 40, height: 40, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: radii.full, marginTop: 6 },
});
