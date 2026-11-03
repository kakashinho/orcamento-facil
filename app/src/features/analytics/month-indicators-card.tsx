import { StyleSheet, View } from "react-native";
import type { MonthIndicators } from "@/data/api/types";
import { useMonthIndicators } from "@/data/queries/reports";
import { formatMoney, formatMoneyWithSign } from "@/domain/money";
import { Divider, Text } from "@/ui";
import { SectionCard } from "./components/section-card";

/** Texto da comparação com a média dos meses anteriores (R75). */
export function savingsComparison(savings: MonthIndicators["savings"], currency: string): string {
  if (savings.previousAverage === null || savings.difference === null || savings.previousMonths.length === 0) {
    return "Sem meses anteriores para comparar";
  }
  const months = savings.previousMonths.length;
  const base = months === 1 ? "o mês anterior" : `a média dos últimos ${months} meses`;
  if (savings.difference === 0) return `O mesmo que ${base}`;
  const direction = savings.difference > 0 ? "a mais" : "a menos";
  return `${formatMoney(Math.abs(savings.difference), currency)} ${direction} que ${base}`;
}

/** Saldo médio diário (R35) e quanto foi economizado no mês comparado aos anteriores (R75). */
export function MonthIndicatorsCard({ month }: { month: string }) {
  const indicators = useMonthIndicators(month);
  const data = indicators.data;
  return (
    <SectionCard
      title="Indicadores do mês"
      loading={indicators.isPending}
      error={indicators.isError && !data ? indicators.error : undefined}
      onRetry={() => void indicators.refetch()}
      testID="month-indicators"
    >
      {data ? (
        <View style={styles.body}>
          <View>
            <Text variant="caption" color="onSurfaceVariant">
              Saldo médio diário
            </Text>
            <Text mono variant="titleLarge" testID="average-daily-balance">
              {data.averageDailyBalance !== null ? formatMoney(data.averageDailyBalance, data.currency) : "—"}
            </Text>
            <Text variant="caption" color="onSurfaceVariant">
              {data.days === 1 ? "em 1 dia" : `em ${data.days} dias`}
            </Text>
          </View>
          <Divider />
          <View>
            <Text variant="caption" color="onSurfaceVariant">
              Economizado no mês
            </Text>
            <Text
              mono
              variant="titleLarge"
              color={(data.savings.saved ?? 0) < 0 ? "error" : "primary"}
              testID="month-saved"
            >
              {data.savings.saved !== null ? formatMoneyWithSign(data.savings.saved, data.currency) : "—"}
            </Text>
            <Text variant="bodySmall" color="onSurfaceVariant" testID="savings-comparison">
              {savingsComparison(data.savings, data.currency)}
            </Text>
          </View>
          {data.ratesStale ? (
            <Text variant="caption" color="onSurfaceVariant">
              Conversão com cotação em cache
            </Text>
          ) : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
