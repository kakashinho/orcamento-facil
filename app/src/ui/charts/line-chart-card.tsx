import { View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useTheme } from "../theme/theme-provider";
import { chartConfigFor, useChartWidth } from "./chart-config";

/**
 * Pontos nulos viram lacuna visual: o chart-kit não aceita `null`, então o ponto repete o último valor
 * conhecido (ou o primeiro, no começo) e o marcador daquele índice é escondido.
 */
export function fillGaps(values: (number | null)[]): { values: number[]; hidden: number[] } {
  let last = values.find((value): value is number => value !== null) ?? 0;
  const hidden: number[] = [];
  const filled = values.map((value, index) => {
    if (value === null) {
      hidden.push(index);
      return last;
    }
    last = value;
    return value;
  });
  return { values: filled, hidden };
}

/** Mantém no máximo `max` rótulos no eixo X, espaçados por igual (30 dias não cabem lado a lado). */
export function thinLabels(labels: string[], max: number): string[] {
  const step = Math.max(1, Math.ceil(labels.length / max));
  return labels.map((label, index) => (index % step === 0 ? label : ""));
}

/** Linha (evolução do saldo — R14; projeção — R63), sobre o `LineChart` do react-native-chart-kit. */
export function LineChartCard({
  labels,
  values,
  color,
  formatY,
  height = 200,
  maxLabels = 6,
  accessibilityLabel,
  testID,
}: {
  labels: string[];
  values: (number | null)[];
  color?: string;
  formatY?: (value: number) => string;
  height?: number;
  maxLabels?: number;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const { values: filled, hidden } = fillGaps(values);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
    >
      {filled.length > 0 ? (
        <LineChart
          data={{ labels: thinLabels(labels, maxLabels), datasets: [{ data: filled }] }}
          width={width}
          height={height}
          chartConfig={chartConfigFor(colors, color ?? colors.primary)}
          withDots={filled.length <= 16}
          hidePointsAtIndex={hidden}
          withVerticalLines={false}
          withOuterLines={false}
          segments={4}
          formatYLabel={formatY ? (label) => formatY(Number(label)) : undefined}
        />
      ) : null}
    </View>
  );
}
