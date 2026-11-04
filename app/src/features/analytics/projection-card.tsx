import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Projection } from "@/data/api/types";
import { useProjection } from "@/data/queries/reports";
import { formatDate, monthLabel, shortMonthLabel } from "@/domain/dates";
import { formatCompactMoney, formatMoney, formatSignedMoney } from "@/domain/money";
import { Chip, Icon, LineChartCard, Text } from "@/ui";
import { SectionCard } from "./components/section-card";

const MONTHS = 6;

/** "Saldo deve ir de R$ A para R$ B até dezembro de 2026". */
export function describeProjection(data: Projection): string {
  const last = data.months[data.months.length - 1];
  if (data.startBalance === null || !last || last.closingBalance === null) return "Projeção indisponível sem câmbio";
  return `Saldo deve ir de ${formatMoney(data.startBalance, data.currency)} para ${formatMoney(last.closingBalance, data.currency)} até ${monthLabel(last.month).toLowerCase()}`;
}

/**
 * Projeção do saldo nos próximos meses pelas recorrências e parcelas (R63). Só consulta quando o
 * cartão aparece na rolagem (R86).
 */
export function ProjectionCard({ enabled }: { enabled: boolean }) {
  const projection = useProjection(MONTHS, enabled);
  const data = projection.data;
  const [selected, setSelected] = useState(0);
  const month = data?.months[selected];

  return (
    <SectionCard
      title="Próximos meses"
      loading={!enabled || projection.isPending}
      error={projection.isError && !data ? projection.error : undefined}
      onRetry={() => void projection.refetch()}
      skeletonHeight={200}
      share={{ period: `Próximos ${MONTHS} meses` }}
      testID="projection"
    >
      {data ? (
        <>
          <LineChartCard
            testID="projection-chart"
            labels={data.months.map((m) => shortMonthLabel(m.month))}
            values={data.months.map((m) => m.closingBalance)}
            formatY={(value) => formatCompactMoney(value, data.currency)}
            accessibilityLabel={describeProjection(data)}
          />
          <Text variant="caption" color="onSurfaceVariant">
            Saldo ao fim de cada mês, considerando só recorrências e parcelas ativas.
          </Text>
          <View style={styles.chips}>
            {data.months.map((m, index) => (
              <Chip
                key={m.month}
                label={shortMonthLabel(m.month)}
                selected={selected === index}
                onPress={() => setSelected(index)}
              />
            ))}
          </View>
          {month ? (
            <View style={styles.month} testID="projection-month">
              <View style={styles.totals}>
                <Text variant="bodySmall" color="primary" mono>
                  {month.expectedIncome !== null ? formatSignedMoney(month.expectedIncome, data.currency, "in") : "—"}
                </Text>
                <Text variant="bodySmall" mono>
                  {month.expectedExpense !== null
                    ? formatSignedMoney(month.expectedExpense, data.currency, "out")
                    : "—"}
                </Text>
                <Text variant="bodySmall" weight="medium" mono style={styles.closing}>
                  {month.closingBalance !== null ? formatMoney(month.closingBalance, data.currency) : "—"}
                </Text>
              </View>
              {month.items.length === 0 ? (
                <Text variant="bodySmall" color="onSurfaceVariant">
                  Nenhum lançamento fixo em {monthLabel(month.month).toLowerCase()}.
                </Text>
              ) : (
                month.items.map((item) => (
                  <View key={`${item.seriesId}-${item.date}`} style={styles.item}>
                    <Icon name={item.kind === "installment" ? "credit_card" : "repeat"} size={18} />
                    <View style={styles.flex}>
                      <Text variant="bodySmall" numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text variant="caption" color="onSurfaceVariant">
                        {formatDate(item.date, "dayMonth")} · {item.kind === "installment" ? "Parcela" : "Recorrente"}
                      </Text>
                    </View>
                    <Text variant="bodySmall" mono color={item.type === "income" ? "primary" : "onSurface"}>
                      {item.amount !== null
                        ? formatSignedMoney(item.amount, data.currency, item.type === "income" ? "in" : "out")
                        : "—"}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
          {data.ratesStale ? (
            <Text variant="caption" color="onSurfaceVariant">
              Conversão com cotação em cache.
            </Text>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  month: { gap: 8 },
  totals: { flexDirection: "row", gap: 12, alignItems: "center" },
  closing: { flex: 1, textAlign: "right" },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, minWidth: 0 },
});
