import { StyleSheet, View } from "react-native";
import { radii } from "../theme/metrics";
import { Text } from "../components/text";

export interface BarGroup {
  label: string;
  bars: { value: number; color: string }[];
  /** Resumo do grupo para o leitor de tela ("outubro de 2026: receitas R$ 10,00..."). */
  accessibilityLabel?: string;
}

/**
 * Barras agrupadas (receita × despesa, orçado × gasto): uma barra por item de cada grupo, com altura
 * proporcional ao maior valor do gráfico. Feito com Views para abrir rápido (R83).
 */
export function GroupedBarChart({
  groups,
  height = 120,
  accessibilityLabel,
  testID,
}: {
  groups: BarGroup[];
  height?: number;
  accessibilityLabel: string;
  testID?: string;
}) {
  const max = Math.max(1, ...groups.flatMap((group) => group.bars.map((bar) => bar.value)));
  return (
    <View
      testID={testID}
      style={[styles.chart, { height: height + 20 }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {groups.map((group, groupIndex) => (
        <View
          key={`${group.label}-${groupIndex}`}
          style={styles.group}
          accessible={!!group.accessibilityLabel}
          accessibilityLabel={group.accessibilityLabel}
        >
          <View style={[styles.bars, { height }]}>
            {group.bars.map((bar, barIndex) => (
              <View
                key={barIndex}
                testID={testID ? `${testID}-bar-${groupIndex}-${barIndex}` : undefined}
                style={[styles.bar, { height: (Math.max(0, bar.value) / max) * height, backgroundColor: bar.color }]}
              />
            ))}
          </View>
          <Text variant="caption" color="onSurfaceVariant" numberOfLines={1}>
            {group.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  group: { flex: 1, alignItems: "center", gap: 4 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 10, minHeight: 2, borderTopLeftRadius: radii.sm / 2, borderTopRightRadius: radii.sm / 2 },
});
