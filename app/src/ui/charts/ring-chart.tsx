import { View } from "react-native";
import { ProgressChart } from "react-native-chart-kit";
import { useTheme } from "../theme/theme-provider";
import { chartConfigFor, useChartWidth } from "./chart-config";

export interface Ring {
  label: string;
  /** Fração de 0 a 1. */
  fraction: number;
  color: string;
}

/** Anéis concêntricos, um por item (R50), sobre o `ProgressChart` do react-native-chart-kit. */
export function RingChart({
  data,
  height = 200,
  accessibilityLabel,
  testID,
}: {
  data: Ring[];
  height?: number;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const spacing = (height / 2 - 32) / Math.max(1, data.length);
  const strokeWidth = Math.max(4, Math.min(14, spacing - 3));
  // O chart-kit não desenha 0 nem 1 exatos (arco degenerado).
  const fractions = data.map((ring) => Math.min(0.999, Math.max(0.001, ring.fraction)));

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
    >
      {data.length > 0 ? (
        <ProgressChart
          data={{ labels: data.map((ring) => ring.label), data: fractions, colors: data.map((ring) => ring.color) }}
          width={width}
          height={height}
          strokeWidth={strokeWidth}
          radius={24}
          hideLegend
          withCustomBarColorFromData
          // A trilha de fundo de cada anel usa `color(0.2)`: neutra, nos dois temas.
          chartConfig={chartConfigFor(colors, colors.onSurfaceVariant)}
        />
      ) : null}
    </View>
  );
}
