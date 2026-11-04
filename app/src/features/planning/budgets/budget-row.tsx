import { Pressable, StyleSheet, View } from "react-native";
import type { BudgetStatus } from "@/data/api/types";
import { BUDGET_STATE_LABEL, budgetFraction, budgetStateColor, percentLabel, remainingLabel } from "@/domain/budgets";
import { formatMoney } from "@/domain/money";
import { Icon, ProgressBar, resolveColor, Text, useTheme, withAlpha } from "@/ui";
import { useCategoryIconResolver } from "../../transactions/use-category-icon";
import { ItemAvatar, StateBadge } from "../components/state-badge";

/**
 * Linha de um orçamento (R21, R74): categoria, "R$ gasto de R$ limite", barra limitada a 100% na cor
 * do estado, percentual e o restante (ou quanto passou). Tocar abre a edição.
 */
export function BudgetRow({ item, onPress }: { item: BudgetStatus; onPress?: () => void }) {
  const { colors, scheme } = useTheme();
  const iconFor = useCategoryIconResolver();
  const color = resolveColor(colors, budgetStateColor(item.state, scheme));
  const limit = formatMoney(item.limit, item.currency);
  const spent = item.spent === null ? null : formatMoney(item.spent, item.currency);
  const remaining = remainingLabel(item);
  const percent = percentLabel(item.percent);
  const summary = spent
    ? `${item.category.name}: gasto ${spent} de ${limit}, ${BUDGET_STATE_LABEL[item.state].toLowerCase()}`
    : `${item.category.name}: limite de ${limit}, gasto indisponível`;

  return (
    <Pressable
      testID={`budget-${item.budgetId}-${item.period}`}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Editar orçamento"
      onPress={onPress}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={styles.row}
    >
      <View style={styles.top}>
        <ItemAvatar>
          <Icon name={iconFor(item.category)} size={20} color="onSecondaryContainer" />
        </ItemAvatar>
        <View style={styles.body}>
          <Text weight="medium" numberOfLines={1}>
            {item.category.name}
          </Text>
          <Text variant="bodySmall" color="onSurfaceVariant" testID="budget-amounts">
            {spent ? (
              <>
                <Text variant="bodySmall" mono weight="medium">
                  {spent}
                </Text>{" "}
                de {limit}
              </>
            ) : (
              `Limite de ${limit} · gasto indisponível (câmbio)`
            )}
          </Text>
        </View>
        <StateBadge label={BUDGET_STATE_LABEL[item.state]} color={color} />
      </View>
      <ProgressBar value={budgetFraction(item.spent, item.limit)} color={color} />
      {spent ? (
        <View style={styles.bottom}>
          <Text variant="label" color="onSurfaceVariant">
            {percent}
          </Text>
          <Text variant="label" color={item.state === "exceeded" ? "error" : "onSurfaceVariant"}>
            {remaining}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 8 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1, minWidth: 0 },
  bottom: { flexDirection: "row", justifyContent: "space-between" },
});
