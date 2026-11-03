import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radii } from "../theme/metrics";
import { Text } from "../components/text";

export interface LegendItem {
  label: string;
  color: string;
  /** Valor exibido ao lado (percentual, total...). */
  value?: string;
}

/** Legenda própria dos gráficos (a do chart-kit fica desligada): legível e acompanha a fonte do sistema. */
export function ChartLegend({
  items,
  layout = "row",
  style,
}: {
  items: LegendItem[];
  /** "row": itens lado a lado; "column": um por linha, com o valor alinhado à direita. */
  layout?: "row" | "column";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[layout === "row" ? styles.row : styles.column, style]}>
      {items.map((item, index) => (
        <View
          key={`${item.label}-${index}`}
          style={[styles.item, layout === "column" && styles.itemColumn]}
          accessible
          accessibilityLabel={item.value ? `${item.label}: ${item.value}` : item.label}
        >
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text
            variant="caption"
            color="onSurfaceVariant"
            numberOfLines={1}
            style={layout === "column" ? styles.label : undefined}
          >
            {item.label}
          </Text>
          {item.value ? (
            <Text variant="caption" mono>
              {item.value}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 6 },
  column: { gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemColumn: { gap: 8 },
  label: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: radii.full },
});
