import { ScrollView, StyleSheet, View } from "react-native";
import type { BudgetStatus } from "@/data/api/types";
import { budgetStateColor, describeBudget } from "@/domain/budgets";
import { Banner, Card, ChartLegend, GroupedBarChart, resolveColor, Text, useTheme, type BarGroup } from "@/ui";

/** Até este número de categorias o gráfico ocupa a largura do cartão; com mais, rola na horizontal. */
const MAX_VISIBLE_GROUPS = 6;
const GROUP_WIDTH = 56;

/**
 * Orçado × gasto por categoria (R45): barra "Orçado" na cor neutra e "Gasto" na cor do estado
 * (ok, atenção, estourado). Gasto indisponível por falta de câmbio: só a barra do limite e um aviso.
 */
export function BudgetChart({ items }: { items: BudgetStatus[] }) {
  const { colors, scheme } = useTheme();
  if (items.length === 0) return null;
  const neutral = colors.outline;
  const groups: BarGroup[] = items.map((item) => ({
    label: item.category.name,
    accessibilityLabel: describeBudget(item),
    bars: [
      { value: item.limit, color: neutral },
      ...(item.spent === null
        ? []
        : [{ value: item.spent, color: resolveColor(colors, budgetStateColor(item.state, scheme)) }]),
    ],
  }));
  const missing = items.filter((item) => item.spent === null).length;
  const chart = (
    <GroupedBarChart
      testID="budget-chart"
      groups={groups}
      height={120}
      accessibilityLabel={`Orçado e gasto por categoria. ${items.map(describeBudget).join("; ")}`}
    />
  );

  return (
    <Card style={styles.card} testID="budget-chart-card">
      <Text weight="medium" accessibilityRole="header">
        Orçado × gasto
      </Text>
      {items.length > MAX_VISIBLE_GROUPS ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: items.length * GROUP_WIDTH }}>{chart}</View>
        </ScrollView>
      ) : (
        chart
      )}
      <ChartLegend
        items={[
          { label: "Orçado", color: neutral },
          { label: "Gasto", color: colors.primary },
        ]}
      />
      {missing > 0 ? (
        <Banner icon="currency_exchange" tone="info">
          {missing === 1
            ? "Câmbio indisponível: o gasto de 1 categoria não pôde ser calculado."
            : `Câmbio indisponível: o gasto de ${missing} categorias não pôde ser calculado.`}
        </Banner>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
});
