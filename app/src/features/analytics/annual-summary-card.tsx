import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useMonthlyReport } from "@/data/queries/reports";
import { summarizeYear } from "@/domain/annual-summary";
import { currentMonth, monthLabel, shortMonthLabel } from "@/domain/dates";
import { formatMoney, formatMoneyWithSign } from "@/domain/money";
import { ChartLegend, GroupedBarChart, IconButton, Text, useTheme, withAlpha } from "@/ui";
import { SectionCard } from "./components/section-card";

/**
 * Resumo anual (R38): receitas × despesas dos 12 meses, com totais e médias mensais.
 * `enabled` só fica verdadeiro quando o cartão aparece na rolagem (R86).
 */
export function AnnualSummaryCard({ enabled }: { enabled: boolean }) {
  const { colors } = useTheme();
  const thisMonth = currentMonth();
  const thisYear = Number(thisMonth.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const report = useMonthlyReport(`${year}-01`, `${year}-12`, enabled);
  const data = report.data;
  const summary = data ? summarizeYear(data.months, year, thisMonth) : null;
  const currency = data?.primaryCurrency ?? "BRL";

  return (
    <SectionCard
      title="Resumo anual"
      action={
        <View style={styles.year}>
          <IconButton
            name="chevron_left"
            accessibilityLabel="Ano anterior"
            size={32}
            onPress={() => setYear((y) => y - 1)}
          />
          <Text weight="medium">{year}</Text>
          <IconButton
            name="chevron_right"
            accessibilityLabel="Próximo ano"
            size={32}
            disabled={year >= thisYear}
            onPress={() => setYear((y) => y + 1)}
          />
        </View>
      }
      loading={!enabled || report.isPending}
      error={report.isError && !data ? report.error : undefined}
      onRetry={() => void report.refetch()}
      skeletonHeight={180}
      share={{ period: `Ano de ${year}` }}
      testID="annual-summary"
    >
      {summary ? (
        <>
          <GroupedBarChart
            testID="annual-chart"
            accessibilityLabel={`Receitas e despesas de ${year}`}
            groups={summary.months.map((m) => ({
              label: shortMonthLabel(m.month).slice(0, 1).toUpperCase(),
              bars: [
                { value: m.income ?? 0, color: m.future ? withAlpha(colors.primary, 0.25) : colors.primary },
                { value: m.expense ?? 0, color: m.future ? withAlpha(colors.error, 0.25) : colors.error },
              ],
              accessibilityLabel: m.future
                ? `${monthLabel(m.month)}: ainda não chegou`
                : `${monthLabel(m.month)}: receitas ${formatMoney(m.income ?? 0, currency)}, despesas ${formatMoney(m.expense ?? 0, currency)}`,
            }))}
          />
          <ChartLegend
            items={[
              { label: "Receitas", color: colors.primary },
              { label: "Despesas", color: colors.error },
            ]}
          />
          <View style={styles.totals}>
            <Figure label="Receitas no ano" value={formatMoney(summary.totals.income, currency)} />
            <Figure label="Despesas no ano" value={formatMoney(summary.totals.expense, currency)} />
            <Figure
              label="Saldo do ano"
              value={formatMoneyWithSign(summary.totals.net, currency)}
              color={summary.totals.net < 0 ? "error" : "primary"}
            />
          </View>
          <Text variant="bodySmall" color="onSurfaceVariant" testID="annual-averages">
            {summary.monthsCounted > 0
              ? `Média mensal: receitas ${formatMoney(summary.totals.averageIncome, currency)} · despesas ${formatMoney(summary.totals.averageExpense, currency)}`
              : "Sem movimentações neste ano."}
          </Text>
        </>
      ) : null}
    </SectionCard>
  );
}

function Figure({ label, value, color = "onSurface" }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.figure}>
      <Text variant="caption" color="onSurfaceVariant">
        {label}
      </Text>
      <Text variant="bodySmall" mono color={color} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  year: { flexDirection: "row", alignItems: "center", gap: 4 },
  totals: { flexDirection: "row", gap: 8 },
  figure: { flex: 1 },
});
