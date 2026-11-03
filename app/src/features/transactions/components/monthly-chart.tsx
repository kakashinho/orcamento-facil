import { StyleSheet, View } from "react-native";
import type { MonthlyReport } from "@/data/api/types";
import { monthLabel, shortMonthLabel } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { ChartLegend, GroupedBarChart, Skeleton, Text, useTheme } from "@/ui";

const CHART_HEIGHT = 120;

/** Gráfico de barras de receitas × despesas por mês (relatórios gráficos — R01). */
export function MonthlyChart({ report, loading }: { report: MonthlyReport | undefined; loading: boolean }) {
  const { colors } = useTheme();
  if (loading || !report) return <Skeleton style={styles.skeleton} />;
  const currency = report.primaryCurrency;
  const groups = report.months.map((m) => {
    const income = m.converted?.income ?? 0;
    const expense = m.converted?.expense ?? 0;
    return {
      label: shortMonthLabel(m.month),
      bars: [
        { value: income, color: colors.primary },
        { value: expense, color: colors.error },
      ],
      accessibilityLabel: `${monthLabel(m.month)}: receitas ${formatMoney(income, currency)}, despesas ${formatMoney(expense, currency)}`,
    };
  });

  return (
    <View>
      <GroupedBarChart groups={groups} height={CHART_HEIGHT} accessibilityLabel="Receitas e despesas por mês" />
      <View style={styles.legend}>
        <ChartLegend
          items={[
            { label: "Receitas", color: colors.primary },
            { label: "Despesas", color: colors.error },
          ]}
        />
        <Text variant="caption" color="onSurfaceVariant">
          em {currency}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { height: CHART_HEIGHT + 40 },
  legend: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
});
