import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import { useMonthIndicators } from "@/data/queries/reports";
import { currentMonth } from "@/domain/dates";
import { ContentContainer, IconButton, Text, useTheme } from "@/ui";
import { AnnualSummaryCard } from "./annual-summary-card";
import { BalanceEvolutionCard } from "./balance-evolution-card";
import { CategoryBreakdownCard } from "./category-breakdown-card";
import { MonthSelector } from "./components/month-selector";
import { MonthIndicatorsCard } from "./month-indicators-card";
import { ProjectionCard } from "./projection-card";
import { TopExpensesCard } from "./top-expenses-card";

/** Distância antes do fim da tela em que um cartão adiado começa a carregar. */
const LAZY_MARGIN = 160;

/**
 * Análises do mês: indicadores (R35, R75), maiores despesas (R36), evolução do saldo (R14), despesas por
 * categoria (R13, R50, R46), resumo anual (R38) e projeção (R63). Ao abrir, 3 consultas em paralelo; o
 * resumo anual e a projeção só carregam quando aparecem na rolagem (R83, R86).
 */
export function AnalyticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const [month, setMonth] = useState(currentMonth);
  const [seenBottom, setSeenBottom] = useState(height);
  const [refreshing, setRefreshing] = useState(false);
  const indicators = useMonthIndicators(month);
  useScreenMetric("analytics.open", !!indicators.data);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const bottom = contentOffset.y + layoutMeasurement.height;
    setSeenBottom((current) => (bottom > current ? bottom : current));
  };

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    setRefreshing(false);
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate("/"));

  return (
    <ScrollView
      testID="analytics-screen"
      onScroll={onScroll}
      scrollEventThrottle={200}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />}
    >
      <ContentContainer style={styles.content}>
        <View style={styles.titleRow}>
          <IconButton name="arrow_back" accessibilityLabel="Voltar" color="onSurface" onPress={back} />
          <Text variant="headline" accessibilityRole="header">
            Análises
          </Text>
        </View>
        <MonthSelector month={month} onChange={setMonth} max={currentMonth()} testID="analytics-month" />
        <MonthIndicatorsCard month={month} />
        <TopExpensesCard month={month} />
        <BalanceEvolutionCard />
        <CategoryBreakdownCard month={month} />
        <Deferred seenBottom={seenBottom}>{(visible) => <AnnualSummaryCard enabled={visible} />}</Deferred>
        <Deferred seenBottom={seenBottom}>{(visible) => <ProjectionCard enabled={visible} />}</Deferred>
      </ContentContainer>
    </ScrollView>
  );
}

/** Habilita o conteúdo na primeira vez que ele entra (ou quase entra) na área visível. */
function Deferred({ seenBottom, children }: { seenBottom: number; children: (visible: boolean) => ReactNode }) {
  const [top, setTop] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  if (!visible && top !== null && top < seenBottom + LAZY_MARGIN) setVisible(true);
  return (
    <View testID="deferred-section" onLayout={(event) => setTop(event.nativeEvent.layout.y)}>
      {children(visible)}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 48 },
  content: { gap: 16, paddingTop: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: -8 },
});
