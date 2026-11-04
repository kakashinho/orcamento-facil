import { ScrollView, View } from "react-native";
import type { BudgetStatus } from "@/data/api/types";
import { budgetStateColor, describeBudget } from "@/domain/budgets";
import { Banner, ChartLegend, GroupedBarChart, resolveColor, useTheme, type BarGroup } from "@/ui";
import { SectionCard } from "../../analytics/components/section-card";

/** Até este número de categorias o gráfico ocupa a largura do cartão; com mais, rola na horizontal. */
const MAX_VISIBLE_GROUPS = 6;
const GROUP_WIDTH = 56;

/**
 * Orçado × gasto por categoria (R45): barra "Orçado" na cor neutra e "Gasto" na cor do estado
 * (ok, atenção, estourado). Gasto indisponível por falta de câmbio: só a barra do limite e um aviso.
 * Compartilhável como imagem (R30), com o mês e o rodapé do app; na captura mostra todas as categorias.
 */
export function BudgetChart({ items, period }: { items: BudgetStatus[]; period: string }) {
  const { colors, scheme } = useTheme();
  if (items.length === 0) return null;
  const neutral = colors.outline;
  const groups: BarGroup[] = items.map((item) => ({
    label: item.category.name,
    accessibilityLabel: describeBudget(item),
    bars: [
      { value: item.limit, color: neutral },
      ...(item.spent === null
        ? []
        : [{ value: item.spent, color: resolveColor(colors, budgetStateColor(item.state, scheme)) }]),
    ],
  }));
  const missing = items.filter((item) => item.spent === null).length;
  const chart = (
    <GroupedBarChart
      testID="budget-chart"
      groups={groups}
      height={120}
      accessibilityLabel={`Orçado e gasto por categoria. ${items.map(describeBudget).join("; ")}`}
    />
  );

  return (
    <SectionCard title="Orçado × gasto" testID="budget-chart-card" share={{ period }}>
      {(capturing) => (
        <>
          {items.length > MAX_VISIBLE_GROUPS && !capturing ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ width: items.length * GROUP_WIDTH }}>{chart}</View>
            </ScrollView>
          ) : (
            chart
          )}
          <ChartLegend
            items={[
              { label: "Orçado", color: neutral },
              { label: "Gasto", color: colors.primary },
            ]}
          />
          {missing > 0 ? (
            <Banner icon="currency_exchange" tone="info">
              {missing === 1
                ? "Câmbio indisponível: o gasto de 1 categoria não pôde ser calculado."
                : `Câmbio indisponível: o gasto de ${missing} categorias não pôde ser calculado.`}
            </Banner>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
