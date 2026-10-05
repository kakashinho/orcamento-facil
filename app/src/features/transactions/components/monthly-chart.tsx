import { StyleSheet, View } from "react-native";
import type { MonthlyReport } from "@/data/api/types";
import { monthLabel, shortMonthLabel } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { radii, Skeleton, Text, useTheme } from "@/ui";

const CHART_HEIGHT = 120;

/**
 * Gráfico de barras de receitas × despesas por mês (relatórios gráficos — R01), feito com
 * Views para carregar rápido (R83) sem biblioteca de gráficos.
 */
export function MonthlyChart({ report, loading }: { report: MonthlyReport | undefined; loading: boolean }) {
  const { colors } = useTheme();
  if (loading || !report) return <Skeleton style={styles.skeleton} />;
  const months = report.months.map((m) => ({
    month: m.month,
    income: m.converted?.income ?? 0,
    expense: m.converted?.expense ?? 0,
  }));
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const currency = report.primaryCurrency;

  return (
    <View>
      <View style={styles.chart} accessibilityRole="image" accessibilityLabel="Receitas e despesas por mês">
        {months.map((m) => (
          <View
            key={m.month}
            style={styles.group}
            accessible
            accessibilityLabel={`${monthLabel(m.month)}: receitas ${formatMoney(m.income, currency)}, despesas ${formatMoney(m.expense, currency)}`}
          >
            <View style={styles.bars}>
              <View
                style={[styles.bar, { height: (m.income / max) * CHART_HEIGHT, backgroundColor: colors.primary }]}
              />
              <View style={[styles.bar, { height: (m.expense / max) * CHART_HEIGHT, backgroundColor: colors.error }]} />
            </View>
            <Text variant="caption" color="onSurfaceVariant">
              {shortMonthLabel(m.month)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Legend color={colors.primary} label="Receitas" />
        <Legend color={colors.error} label="Despesas" />
        <Text variant="caption" color="onSurfaceVariant">
          em {currency}
        </Text>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" color="onSurfaceVariant">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { height: CHART_HEIGHT + 40 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: CHART_HEIGHT + 20 },
  group: { flex: 1, alignItems: "center", gap: 4 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: CHART_HEIGHT },
  bar: { width: 10, minHeight: 2, borderTopLeftRadius: radii.sm / 2, borderTopRightRadius: radii.sm / 2 },
  legend: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: radii.full },
});
