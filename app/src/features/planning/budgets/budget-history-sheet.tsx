import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { BudgetHistory, BudgetStatus } from "@/data/api/types";
import { useBudgetHistory } from "@/data/queries/planning";
import { BUDGET_STATE_LABEL, budgetStateColor, spentDifferenceLabel } from "@/domain/budgets";
import { currentMonth, monthLabel, shiftMonth } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { Banner, Card, Chip, Divider, SegmentedControl, Sheet, Skeleton, Text, useTheme } from "@/ui";
import { MonthSelector } from "../../analytics/components/month-selector";
import { StateBadge } from "../components/state-badge";

type Mode = "months" | "compare";
type Span = 6 | 12;

/**
 * Histórico dos orçamentos mensais (R23): os últimos 6 ou 12 meses até o mês escolhido, com o limite
 * em vigor em cada mês, e o modo "Comparar", com dois meses lado a lado e a diferença de gasto.
 */
export function BudgetHistorySheet({ open, month, onClose }: { open: boolean; month: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("months");
  const [span, setSpan] = useState<Span>(6);
  const [first, setFirst] = useState(() => shiftMonth(month, -1));
  const [second, setSecond] = useState(month);
  const history = useBudgetHistory(shiftMonth(month, -(span - 1)), month, open && mode === "months");
  const before = useBudgetHistory(first, first, open && mode === "compare");
  const after = useBudgetHistory(second, second, open && mode === "compare");
  const max = currentMonth();

  return (
    <Sheet open={open} onClose={onClose} title="Histórico de orçamentos" testID="budget-history">
      <View style={styles.content}>
        <SegmentedControl
          accessibilityLabel="Visão do histórico"
          value={mode}
          onChange={setMode}
          options={[
            { value: "months", label: "Meses" },
            { value: "compare", label: "Comparar" },
          ]}
        />
        {mode === "months" ? (
          <>
            <View style={styles.chips}>
              {([6, 12] as const).map((value) => (
                <Chip key={value} label={`${value} meses`} selected={span === value} onPress={() => setSpan(value)} />
              ))}
            </View>
            <Loaded query={history}>
              {(data) =>
                [...data.months].reverse().map((entry) => (
                  <Card key={entry.month} style={styles.month} testID={`history-${entry.month}`}>
                    <Text weight="medium" accessibilityRole="header">
                      {monthLabel(entry.month)}
                    </Text>
                    {entry.items.length === 0 ? (
                      <Text variant="bodySmall" color="onSurfaceVariant">
                        Sem orçamentos neste mês
                      </Text>
                    ) : (
                      entry.items.map((item, index) => (
                        <View key={item.budgetId}>
                          {index > 0 ? <Divider style={styles.divider} /> : null}
                          <HistoryItem item={item} />
                        </View>
                      ))
                    )}
                  </Card>
                ))
              }
            </Loaded>
          </>
        ) : (
          <>
            <Card style={styles.selectors}>
              <MonthSelector month={first} onChange={setFirst} max={max} testID="compare-first" />
              <Divider />
              <MonthSelector month={second} onChange={setSecond} max={max} testID="compare-second" />
            </Card>
            <Loaded query={before}>
              {(a) => (
                <Loaded query={after}>
                  {(b) => <Comparison first={first} second={second} before={a} after={b} />}
                </Loaded>
              )}
            </Loaded>
          </>
        )}
      </View>
    </Sheet>
  );
}

/** Estados de carregamento e erro de uma consulta do histórico. */
function Loaded({
  query,
  children,
}: {
  query: ReturnType<typeof useBudgetHistory>;
  children: (data: BudgetHistory) => ReactNode;
}) {
  if (query.isPending) return <Skeleton style={styles.skeleton} />;
  if (query.isError)
    return (
      <Banner icon="cloud_off" tone="error">
        {errorMessage(query.error)}
      </Banner>
    );
  return <>{children(query.data)}</>;
}

function HistoryItem({ item }: { item: BudgetStatus }) {
  const { scheme } = useTheme();
  return (
    <View style={styles.item} accessible>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="medium">
          {item.category.name}
        </Text>
        <Text variant="label" color="onSurfaceVariant">
          {item.spent === null
            ? `Limite ${formatMoney(item.limit, item.currency)} · gasto indisponível`
            : `Gasto ${formatMoney(item.spent, item.currency)} de ${formatMoney(item.limit, item.currency)}`}
        </Text>
      </View>
      <StateBadge label={BUDGET_STATE_LABEL[item.state]} color={budgetStateColor(item.state, scheme)} />
    </View>
  );
}

/** Por categoria, os dois meses lado a lado e a diferença de gasto do segundo em relação ao primeiro. */
function Comparison({
  first,
  second,
  before,
  after,
}: {
  first: string;
  second: string;
  before: BudgetHistory;
  after: BudgetHistory;
}) {
  const a = before.months[0]?.items ?? [];
  const b = after.months[0]?.items ?? [];
  const ids = [...new Set([...a, ...b].map((item) => item.category.id))];
  if (ids.length === 0)
    return (
      <Text variant="bodySmall" color="onSurfaceVariant">
        Sem orçamentos nestes meses
      </Text>
    );
  return (
    <Card style={styles.month} testID="budget-comparison">
      {ids.map((id, index) => {
        const left = a.find((item) => item.category.id === id);
        const right = b.find((item) => item.category.id === id);
        const name = (left ?? right)!.category.name;
        const currency = (left ?? right)!.currency;
        const difference = left && right ? spentDifferenceLabel(left.spent, right.spent, currency) : null;
        return (
          <View key={id} testID={`compare-${id}`}>
            {index > 0 ? <Divider style={styles.divider} /> : null}
            <Text variant="bodySmall" weight="medium">
              {name}
            </Text>
            <View style={styles.columns}>
              <CompareCell month={first} item={left} />
              <CompareCell month={second} item={right} />
            </View>
            {difference ? (
              <Text variant="label" weight="medium" testID="compare-difference">
                {difference} em {monthLabel(second).toLowerCase()}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

function CompareCell({ month, item }: { month: string; item: BudgetStatus | undefined }) {
  return (
    <View style={styles.flex}>
      <Text variant="caption" color="onSurfaceVariant">
        {monthLabel(month)}
      </Text>
      {item ? (
        <>
          <Text variant="bodySmall" mono>
            {item.spent === null ? "—" : formatMoney(item.spent, item.currency)}
          </Text>
          <Text variant="caption" color="onSurfaceVariant">
            de {formatMoney(item.limit, item.currency)}
          </Text>
        </>
      ) : (
        <Text variant="caption" color="onSurfaceVariant">
          Sem orçamento
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 12 },
  chips: { flexDirection: "row", gap: 8 },
  month: { padding: 16, gap: 8 },
  selectors: { paddingHorizontal: 8, paddingVertical: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { marginVertical: 8 },
  columns: { flexDirection: "row", gap: 12, marginTop: 4 },
  flex: { flex: 1 },
  skeleton: { height: 120 },
});
