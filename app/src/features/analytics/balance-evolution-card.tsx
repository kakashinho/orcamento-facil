import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BalanceEvolution, BalanceEvolutionQuery } from "@/data/api/types";
import { useWalletSummary } from "@/data/queries/finance";
import { useBalanceEvolution } from "@/data/queries/reports";
import {
  addDays,
  currentMonth,
  dayLabel,
  firstDayOfMonth,
  shiftMonth,
  shortMonthLabel,
  todayIso,
} from "@/domain/dates";
import { formatCompactMoney, formatMoney } from "@/domain/money";
import { Chip, LineChartCard, SegmentedControl, Text } from "@/ui";
import { SectionCard } from "./components/section-card";

export type EvolutionRange = "30d" | "12m";

/** Consulta do período: 30 dias por dia ou 12 meses por mês, terminando hoje. */
export function evolutionQuery(
  range: EvolutionRange,
  walletId: string | null,
  now = new Date(),
): BalanceEvolutionQuery {
  const today = todayIso(now);
  const base =
    range === "30d"
      ? { from: addDays(today, -29), to: today, granularity: "day" as const }
      : { from: firstDayOfMonth(shiftMonth(currentMonth(now), -11)), to: today, granularity: "month" as const };
  return walletId ? { ...base, walletId } : base;
}

/** "Saldo foi de R$ A para R$ B no período" (gráficos não são lidos pelo leitor de tela). */
export function describeEvolution(data: BalanceEvolution): string {
  const known = data.points.filter((point) => point.balance !== null);
  if (known.length === 0) return "Sem saldo disponível no período";
  const first = known[0].balance as number;
  const last = known[known.length - 1].balance as number;
  return `Saldo foi de ${formatMoney(first, data.currency)} para ${formatMoney(last, data.currency)} no período`;
}

/** Evolução do saldo (R14): consolidado ou de uma carteira, nos últimos 30 dias ou 12 meses. */
export function BalanceEvolutionCard() {
  const [range, setRange] = useState<EvolutionRange>("30d");
  const [walletId, setWalletId] = useState<string | null>(null);
  const wallets = useWalletSummary().data?.wallets ?? [];
  const evolution = useBalanceEvolution(evolutionQuery(range, walletId));
  const data = evolution.data;
  const missing = !!data && data.points.some((point) => point.balance === null);

  return (
    <SectionCard
      title="Evolução do saldo"
      loading={evolution.isPending}
      error={evolution.isError && !data ? evolution.error : undefined}
      onRetry={() => void evolution.refetch()}
      skeletonHeight={200}
      testID="balance-evolution"
    >
      <SegmentedControl
        accessibilityLabel="Período da evolução"
        value={range}
        onChange={setRange}
        options={[
          { value: "30d", label: "30 dias" },
          { value: "12m", label: "12 meses" },
        ]}
      />
      {wallets.length > 1 ? (
        <View style={styles.chips}>
          <Chip label="Todas" selected={!walletId} onPress={() => setWalletId(null)} />
          {wallets.map((wallet) => (
            <Chip
              key={wallet.id}
              label={wallet.name}
              selected={walletId === wallet.id}
              onPress={() => setWalletId(wallet.id)}
            />
          ))}
        </View>
      ) : null}
      {data ? (
        <>
          <LineChartCard
            testID="balance-evolution-chart"
            labels={data.points.map((point) =>
              data.granularity === "day" ? dayLabel(point.date) : shortMonthLabel(point.date.slice(0, 7)),
            )}
            values={data.points.map((point) => point.balance)}
            formatY={(value) => formatCompactMoney(value, data.currency)}
            accessibilityLabel={describeEvolution(data)}
          />
          <Text variant="caption" color="onSurfaceVariant">
            {walletId ? `Saldo da carteira, em ${data.currency}` : `Saldo de todas as carteiras, em ${data.currency}`}
          </Text>
          {missing || data.ratesStale ? (
            <Text variant="caption" color="onSurfaceVariant">
              {missing ? "Câmbio indisponível para alguns dias." : "Conversão com cotação em cache."}
            </Text>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
