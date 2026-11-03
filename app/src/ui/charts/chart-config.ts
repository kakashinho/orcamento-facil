import { useCallback, useState, type ComponentProps } from "react";
import type { LayoutChangeEvent } from "react-native";
import type { LineChart } from "react-native-chart-kit";
import { withAlpha, type Palette } from "../theme/colors";

type ChartConfig = NonNullable<ComponentProps<typeof LineChart>["chartConfig"]>;

/** Largura usada antes da primeira medição (e nos testes, onde `onLayout` não dispara). */
export const DEFAULT_CHART_WIDTH = 320;

/** Mede a largura disponível: o gráfico acompanha o cartão em celulares e tablets (R82). */
export function useChartWidth() {
  const [width, setWidth] = useState(DEFAULT_CHART_WIDTH);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0) setWidth((current) => (current === measured ? current : measured));
  }, []);
  return { width, onLayout };
}

/** Configuração do react-native-chart-kit com os tokens do tema; o fundo é transparente (o cartão já tem cor). */
export function chartConfigFor(colors: Palette, accent: string = colors.primary): ChartConfig {
  return {
    backgroundGradientFrom: colors.surface,
    backgroundGradientFromOpacity: 0,
    backgroundGradientTo: colors.surface,
    backgroundGradientToOpacity: 0,
    color: (opacity = 1) => withAlpha(accent, opacity),
    labelColor: (opacity = 1) => withAlpha(colors.onSurfaceVariant, opacity),
    decimalPlaces: 0,
    propsForBackgroundLines: { stroke: withAlpha(colors.outlineVariant, 0.6), strokeDasharray: "" },
    propsForLabels: { fontSize: 10 },
    propsForDots: { r: "3" },
  };
}
