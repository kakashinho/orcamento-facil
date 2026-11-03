import { View } from "react-native";
import { PieChart } from "react-native-chart-kit";
import Svg, { Circle } from "react-native-svg";
import { withAlpha } from "../theme/colors";
import { useTheme } from "../theme/theme-provider";
import { chartConfigFor, useChartWidth } from "./chart-config";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Pizza das despesas por categoria (R13), sobre o `PieChart` do react-native-chart-kit. */
export function PieChartCard({
  data,
  height = 180,
  accessibilityLabel,
  testID,
}: {
  data: Slice[];
  height?: number;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const slices = data.filter((slice) => slice.value > 0);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
    >
      {slices.length > 1 ? (
        <PieChart
          data={slices.map((slice) => ({ name: slice.label, value: slice.value, color: slice.color }))}
          accessor="value"
          width={width}
          height={height}
          // O chart-kit centraliza a pizza em width/4 + paddingLeft.
          paddingLeft={String(width / 4)}
          backgroundColor="transparent"
          hasLegend={false}
          chartConfig={chartConfigFor(colors)}
        />
      ) : (
        // Uma fatia só (ou nenhuma) é um círculo: o arco de 360° do chart-kit sai vazio.
        <Svg width={width} height={height}>
          <Circle
            cx={width / 2}
            cy={height / 2}
            r={height / 2.5}
            fill={slices[0]?.color ?? withAlpha(colors.outlineVariant, 0.6)}
          />
        </Svg>
      )}
    </View>
  );
}
