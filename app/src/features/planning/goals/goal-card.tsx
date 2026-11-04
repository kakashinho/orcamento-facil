import { StyleSheet, View } from "react-native";
import type { Goal } from "@/data/api/types";
import { todayIso } from "@/domain/dates";
import {
  deadlineLabel,
  GOAL_STATUS_LABEL,
  goalPercentLabel,
  goalRemainingLabel,
  progressFraction,
} from "@/domain/goals";
import { formatMoney } from "@/domain/money";
import { Card, Icon, ProgressBar, Text, useTheme } from "@/ui";
import { useCategoryIconResolver } from "../../transactions/use-category-icon";
import { ItemAvatar, StateBadge } from "../components/state-badge";

/**
 * Cartão da meta de economia (R15, R16): nome, categoria, "R$ guardado de R$ alvo", barra limitada a
 * 100% (o percentual real aparece ao lado), quanto falta e o prazo; selo "Atingida" ou "Cancelada".
 */
export function GoalCard({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const { colors } = useTheme();
  const iconFor = useCategoryIconResolver();
  const money = (value: number) => formatMoney(value, goal.currency);
  const remaining = goalRemainingLabel(goal);
  const percent = goalPercentLabel(goal.percent);
  const deadline = goal.status === "active" ? deadlineLabel(goal.deadline, todayIso()) : null;
  const saved = goal.saved === null ? null : money(goal.saved);
  const barColor = goal.status === "cancelled" ? colors.outline : colors.primary;

  return (
    <Card
      onPress={onPress}
      style={styles.card}
      testID={`goal-${goal.id}`}
      accessibilityLabel={`Meta ${goal.name}: ${saved ?? "valor indisponível"} de ${money(goal.targetAmount)}${
        percent ? `, ${percent}` : ""
      }${deadline ? `, ${deadline.toLowerCase()}` : ""}`}
    >
      <View style={styles.header}>
        <ItemAvatar>
          <Icon name={iconFor(goal.category)} size={20} color="onSecondaryContainer" />
        </ItemAvatar>
        <View style={styles.flex}>
          <Text weight="medium" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text variant="label" color="onSurfaceVariant" numberOfLines={1}>
            {goal.category.name}
          </Text>
        </View>
        {goal.status !== "active" ? (
          <StateBadge
            label={GOAL_STATUS_LABEL[goal.status]}
            color={goal.status === "achieved" ? "primary" : "onSurfaceVariant"}
            testID="goal-status"
          />
        ) : null}
      </View>
      <Text variant="bodySmall" color="onSurfaceVariant" testID="goal-amounts">
        {saved ? (
          <>
            <Text variant="bodySmall" mono weight="medium">
              {saved}
            </Text>{" "}
            de {money(goal.targetAmount)}
          </>
        ) : (
          `Alvo de ${money(goal.targetAmount)} · valor guardado indisponível (câmbio)`
        )}
      </Text>
      <View style={styles.progress}>
        <View style={styles.flex}>
          <ProgressBar value={progressFraction(goal.saved, goal.targetAmount)} color={barColor} />
        </View>
        {percent ? (
          <Text variant="label" weight="medium" mono testID="goal-percent">
            {percent}
          </Text>
        ) : null}
      </View>
      <Text variant="label" color="onSurfaceVariant" testID="goal-footer">
        {[remaining, deadline].filter(Boolean).join(" · ")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  progress: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1, minWidth: 0 },
});
