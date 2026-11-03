import { StyleSheet, View } from "react-native";
import { useMonthIndicators } from "@/data/queries/reports";
import { formatMoney } from "@/domain/money";
import { Text } from "@/ui";
import { useAppSheets } from "../shell/app-sheets";
import { TransactionRow } from "../transactions/components/transaction-row";
import { useCategoryIconResolver } from "../transactions/use-category-icon";
import { SectionCard } from "./components/section-card";

/** As 10 maiores despesas do mês (R36); o toque abre os detalhes da transação. */
export function TopExpensesCard({ month }: { month: string }) {
  const indicators = useMonthIndicators(month);
  const { openTransactionDetails } = useAppSheets();
  const iconFor = useCategoryIconResolver();
  const data = indicators.data;
  return (
    <SectionCard
      title="Maiores despesas"
      loading={indicators.isPending}
      error={indicators.isError && !data ? indicators.error : undefined}
      onRetry={() => void indicators.refetch()}
      skeletonHeight={200}
      testID="top-expenses"
    >
      {data && data.topExpenses.length === 0 ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Nenhuma despesa neste mês.
        </Text>
      ) : null}
      {data ? (
        <View style={styles.list}>
          {data.topExpenses.map(({ transaction, convertedAmount }, index) => (
            <View key={transaction.id}>
              <View style={styles.rank}>
                <Text variant="caption" color="onSurfaceVariant" style={styles.position}>
                  {index + 1}º
                </Text>
                <View style={styles.flex}>
                  <TransactionRow
                    transaction={transaction}
                    icon={iconFor(transaction.category)}
                    onPress={openTransactionDetails}
                  />
                </View>
              </View>
              {transaction.currency !== data.currency && convertedAmount !== null ? (
                <Text variant="caption" color="onSurfaceVariant" style={styles.converted}>
                  ≈ {formatMoney(convertedAmount, data.currency)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -16 },
  rank: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  position: { width: 24 },
  flex: { flex: 1 },
  converted: { textAlign: "right", paddingRight: 16, marginTop: -10, marginBottom: 4 },
});
