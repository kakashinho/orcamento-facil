import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useCategories } from "@/data/queries/finance";
import { useByCategory } from "@/data/queries/reports";
import { describeShares, formatPercent, groupTopCategories, OTHERS_LABEL } from "@/domain/charts";
import { currentMonth, firstDayOfMonth, lastDayOfMonth, shiftMonth, todayIso } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import {
  Button,
  ChartLegend,
  Chip,
  DateField,
  IconButton,
  PieChartCard,
  RingChart,
  SegmentedControl,
  Text,
} from "@/ui";
import { CategoryVisibilitySheet } from "./category-visibility-sheet";
import { SectionCard } from "./components/section-card";

export type BreakdownPeriod = "month" | "previous" | "quarter" | "custom";

/** Datas de cada atalho de período; o mês atual termina hoje. */
export function breakdownRange(
  period: BreakdownPeriod,
  month: string,
  custom: { from: string; to: string },
  now = new Date(),
): { from: string; to: string } {
  const today = todayIso(now);
  const clamp = (to: string) => (to > today ? today : to);
  if (period === "custom") return custom;
  if (period === "previous") {
    const previous = shiftMonth(month, -1);
    return { from: firstDayOfMonth(previous), to: clamp(lastDayOfMonth(previous)) };
  }
  if (period === "quarter") return { from: firstDayOfMonth(shiftMonth(month, -2)), to: clamp(lastDayOfMonth(month)) };
  return { from: firstDayOfMonth(month), to: clamp(lastDayOfMonth(month)) };
}

/** Despesas por categoria em pizza (R13) ou anéis (R50), sem as categorias ocultas (R46). */
export function CategoryBreakdownCard({ month }: { month: string }) {
  const [mode, setMode] = useState<"pie" | "rings">("pie");
  const [period, setPeriod] = useState<BreakdownPeriod>("month");
  const [custom, setCustom] = useState(() => ({ from: firstDayOfMonth(currentMonth()), to: todayIso() }));
  const [manageOpen, setManageOpen] = useState(false);
  const range = breakdownRange(period, month, custom);
  const report = useByCategory({ ...range, type: "expense" });
  const categories = useCategories().data;
  const data = report.data;

  const rows = useMemo(() => {
    const systemKeys = Object.fromEntries((categories ?? []).map((c) => [c.id, c.systemKey]));
    return data ? groupTopCategories(data.categories, systemKeys) : [];
  }, [data, categories]);
  const currency = data?.primaryCurrency ?? "BRL";
  const summary = describeShares(rows);

  return (
    <>
      <SectionCard
        title="Despesas por categoria"
        action={
          <IconButton name="visibility" accessibilityLabel="Categorias exibidas" onPress={() => setManageOpen(true)} />
        }
        loading={report.isPending}
        error={report.isError && !data ? report.error : undefined}
        onRetry={() => void report.refetch()}
        skeletonHeight={220}
        testID="category-breakdown"
      >
        <View style={styles.chips}>
          <Chip label="Este mês" selected={period === "month"} onPress={() => setPeriod("month")} />
          <Chip label="Mês anterior" selected={period === "previous"} onPress={() => setPeriod("previous")} />
          <Chip label="Últimos 3 meses" selected={period === "quarter"} onPress={() => setPeriod("quarter")} />
          <Chip label="Personalizado" selected={period === "custom"} onPress={() => setPeriod("custom")} />
        </View>
        {period === "custom" ? (
          <View style={styles.dates}>
            <DateField
              compact
              label="De"
              value={custom.from}
              onChange={(from) => from && setCustom((c) => ({ ...c, from }))}
              style={styles.flex}
            />
            <DateField
              compact
              label="Até"
              value={custom.to}
              onChange={(to) => to && setCustom((c) => ({ ...c, to }))}
              style={styles.flex}
            />
          </View>
        ) : null}

        {data && rows.length === 0 ? (
          <Text variant="bodySmall" color="onSurfaceVariant">
            Nenhuma despesa no período.
          </Text>
        ) : null}

        {data && rows.length > 0 ? (
          <>
            <SegmentedControl
              accessibilityLabel="Tipo de gráfico"
              value={mode}
              onChange={setMode}
              options={[
                { value: "pie", label: "Pizza" },
                { value: "rings", label: "Anéis" },
              ]}
            />
            {mode === "pie" ? (
              <PieChartCard
                testID="category-pie"
                data={rows.map((row) => ({ label: row.label, value: row.value, color: row.color }))}
                accessibilityLabel={summary}
              />
            ) : (
              <RingChart
                testID="category-rings"
                data={rows
                  .filter((row) => row.label !== OTHERS_LABEL)
                  .map((row) => ({ label: row.label, fraction: row.share / 100, color: row.color }))}
                accessibilityLabel={summary}
              />
            )}
            <ChartLegend
              layout="column"
              items={rows.map((row) => ({
                label: row.label,
                color: row.color,
                value: `${formatMoney(row.value, currency)} · ${formatPercent(row.share)}`,
              }))}
            />
            {data.convertedTotal !== null ? (
              <Text variant="bodySmall" color="onSurfaceVariant">
                Total: {formatMoney(data.convertedTotal, currency)}
              </Text>
            ) : (
              <Text variant="caption" color="onSurfaceVariant">
                Câmbio indisponível: algumas despesas em outras moedas ficaram de fora.
              </Text>
            )}
          </>
        ) : null}

        {data && data.hidden.count > 0 ? (
          <View style={styles.hidden} testID="hidden-categories">
            <Text variant="bodySmall" color="onSurfaceVariant" style={styles.flex}>
              {data.hidden.count === 1 ? "1 categoria oculta" : `${data.hidden.count} categorias ocultas`}
            </Text>
            <Button variant="text" label="Gerenciar" onPress={() => setManageOpen(true)} />
          </View>
        ) : null}
      </SectionCard>
      <CategoryVisibilitySheet open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dates: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  hidden: { flexDirection: "row", alignItems: "center", gap: 8 },
});
