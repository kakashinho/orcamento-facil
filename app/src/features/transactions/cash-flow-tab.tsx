import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import { useCashFlow, useMonthlyReport } from "@/data/queries/reports";
import { useRates, useWalletSummary } from "@/data/queries/finance";
import { useCurrentUser } from "@/data/session/session-store";
import { currentMonth, formatDate, monthToDate, shiftMonth } from "@/domain/dates";
import { formatMoney, formatMoneyWithSign } from "@/domain/money";
import {
  Banner,
  Card,
  Chip,
  DateField,
  EmptyState,
  radii,
  Sheet,
  Skeleton,
  Text,
  useResponsiveLayout,
  useTheme,
} from "@/ui";
import { buildCashFlowRows, type CashFlowKindFilter, type CashFlowRow } from "./cash-flow";
import { FilterActions, FilterSection, FilterToolbar } from "./components/filter-toolbar";
import { MonthlyChart } from "./components/monthly-chart";

/** Fluxo de caixa (R58): entradas e saídas do período em ordem cronológica, com saldo acumulado. */
export function CashFlowTab() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const user = useCurrentUser();
  const primary = user?.primaryCurrency ?? "BRL";
  const wallets = useWalletSummary().data?.wallets ?? [];
  const [period, setPeriod] = useState(() => monthToDate());
  const [walletId, setWalletId] = useState<string | null>(null);
  const [kind, setKind] = useState<CashFlowKindFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const month = currentMonth();
  const monthly = useMonthlyReport(shiftMonth(month, -5), month);
  const flow = useCashFlow({ from: period.from, to: period.to, walletId: walletId ?? undefined });
  const rates = useRates(primary).data?.rates;

  const rows = useMemo(
    () => (flow.data ? buildCashFlowRows(flow.data.entries, flow.data.primaryCurrency, rates, kind) : []),
    [flow.data, rates, kind],
  );
  const active = (walletId ? 1 : 0) + (kind !== "all" ? 1 : 0);
  useScreenMetric("transactions.cash_flow", !!flow.data && !!monthly.data);
  const total = flow.data?.convertedTotal;

  const header = (
    <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
      <FilterToolbar
        label={`${formatDate(period.from)} — ${formatDate(period.to)}`}
        active={active}
        onOpen={() => setFiltersOpen(true)}
      />
      {active > 0 ? (
        <View style={styles.wrap}>
          {kind !== "all" ? (
            <Chip
              selected
              label={kind === "in" ? "Entradas" : "Saídas"}
              trailingIcon="close"
              onPress={() => setKind("all")}
            />
          ) : null}
          {walletId ? (
            <Chip
              selected
              label={wallets.find((w) => w.id === walletId)?.name ?? "Carteira"}
              trailingIcon="close"
              onPress={() => setWalletId(null)}
            />
          ) : null}
        </View>
      ) : null}

      <Card style={styles.card}>
        <Text variant="bodySmall" weight="medium" style={styles.cardTitle}>
          Receitas e despesas · últimos 6 meses
        </Text>
        <MonthlyChart report={monthly.data} loading={monthly.isPending} />
      </Card>

      {total ? (
        <Card style={styles.card} testID="cash-flow-totals">
          <View style={styles.totals}>
            <Total label="Entradas" value={formatMoney(total.inflow, total.currency)} color="primary" />
            <Total label="Saídas" value={formatMoney(total.outflow, total.currency)} />
            <Total
              label="Resultado"
              value={formatMoneyWithSign(total.net, total.currency)}
              color={total.net < 0 ? "error" : "onSurface"}
            />
          </View>
          {total.ratesStale ? (
            <Text variant="caption" color="onSurfaceVariant">
              Cotações do cache: o provedor de câmbio está indisponível.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Text variant="bodySmall" color="onSurfaceVariant">
        Movimentações em ordem cronológica, com saldo acumulado em {flow.data?.primaryCurrency ?? primary}.
        {walletId ? "" : " Transferências entre carteiras não entram no fluxo geral."}
      </Text>
      {flow.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(flow.error)}
        </Banner>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
        testID="cash-flow-list"
        data={rows}
        keyExtractor={(row, index) => `${row.entry.referenceId}-${row.entry.kind}-${index}`}
        renderItem={({ item, index }) => (
          <TimelineRow row={item} last={index === rows.length - 1} primary={flow.data?.primaryCurrency ?? primary} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          flow.isPending ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={styles.skeleton} />
              ))}
            </View>
          ) : flow.isError ? null : (
            <EmptyState
              icon="timeline"
              title="Sem movimentações"
              description="Nenhuma transação corresponde aos filtros deste período."
            />
          )
        }
        contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}
        style={styles.flex}
        refreshControl={
          <RefreshControl
            refreshing={flow.isRefetching}
            onRefresh={() => void flow.refetch()}
            colors={[colors.primary]}
          />
        }
      />

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
        <View style={styles.sheet}>
          <FilterSection label="Intervalo de datas">
            <View style={styles.dates}>
              <DateField
                compact
                label="De"
                value={period.from}
                onChange={(from) => from && setPeriod((p) => ({ ...p, from }))}
                style={styles.flex}
              />
              <DateField
                compact
                label="Até"
                value={period.to}
                onChange={(to) => to && setPeriod((p) => ({ ...p, to }))}
                style={styles.flex}
              />
            </View>
          </FilterSection>
          <FilterSection label="Tipo">
            <View style={styles.wrap}>
              <Chip label="Todas" selected={kind === "all"} onPress={() => setKind("all")} />
              <Chip label="Entradas" selected={kind === "in"} onPress={() => setKind("in")} />
              <Chip label="Saídas" selected={kind === "out"} onPress={() => setKind("out")} />
            </View>
          </FilterSection>
          <FilterSection label="Carteira" hint="Com uma carteira escolhida, as transferências dela também aparecem.">
            <View style={styles.wrap}>
              <Chip label="Todas" selected={!walletId} onPress={() => setWalletId(null)} />
              {wallets.map((w) => (
                <Chip key={w.id} label={w.name} selected={walletId === w.id} onPress={() => setWalletId(w.id)} />
              ))}
            </View>
          </FilterSection>
          <FilterActions
            onClear={() => {
              setKind("all");
              setWalletId(null);
              setPeriod(monthToDate());
            }}
            onApply={() => setFiltersOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
}

function Total({
  label,
  value,
  color = "onSurface",
}: {
  label: string;
  value: string;
  color?: "primary" | "onSurface" | "error";
}) {
  return (
    <View style={styles.total}>
      <Text variant="caption" color="onSurfaceVariant">
        {label}
      </Text>
      <Text variant="bodySmall" mono color={color} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TimelineRow({ row, last, primary }: { row: CashFlowRow; last: boolean; primary: string }) {
  const { colors } = useTheme();
  const { entry } = row;
  const isIn = entry.amount >= 0;
  const dot = row.isTransfer ? colors.outline : isIn ? colors.primary : colors.error;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.rail}>
        <View style={[styles.line, { backgroundColor: colors.outlineVariant }, last && styles.lineLast]} />
        <View style={[styles.dot, { backgroundColor: dot, borderColor: colors.surface }]} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1}>{entry.description}</Text>
        <Text variant="caption" color="onSurfaceVariant" numberOfLines={1}>
          {formatDate(entry.date, "dayMonth")} ·{" "}
          {row.isTransfer ? "Transferência" : (entry.category?.name ?? "Sem categoria")} · {entry.wallet.name}
        </Text>
      </View>
      <View style={styles.rowAmounts}>
        <Text variant="bodySmall" mono color={row.isTransfer ? "onSurfaceVariant" : isIn ? "primary" : "onSurface"}>
          {formatMoneyWithSign(entry.amount, entry.wallet.currency)}
        </Text>
        {row.running !== null ? (
          <Text variant="caption" mono color="onSurfaceVariant">
            saldo {formatMoney(row.running, primary)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: "100%", alignSelf: "center", paddingBottom: 112 },
  header: { gap: 12, paddingTop: 12, paddingBottom: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { padding: 16 },
  cardTitle: { marginBottom: 12 },
  totals: { flexDirection: "row", gap: 8 },
  total: { flex: 1 },
  skeleton: { height: 48 },
  sheet: { gap: 16, paddingTop: 12 },
  dates: { flexDirection: "row", gap: 12 },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 20,
    paddingLeft: 20,
    minHeight: 60,
  },
  rail: { width: 16, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  line: { position: "absolute", top: 0, bottom: 0, width: 2 },
  lineLast: { bottom: "50%" },
  dot: { width: 14, height: 14, borderRadius: radii.full, borderWidth: 2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowAmounts: { alignItems: "flex-end" },
});
