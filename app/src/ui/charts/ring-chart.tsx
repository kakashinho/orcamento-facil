import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useTheme } from "../theme/theme-provider";
import { useChartWidth } from "./chart-config";

export interface Ring {
  label: string;
  /** Fração de 0 a 1. */
  fraction: number;
  color: string;
}

/** Anéis concêntricos, um por item (R50): trilha cinza e arco proporcional, a partir do topo, no sentido horário. */
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
  const size = Math.min(width, height);
  const center = size / 2;
  const count = Math.max(1, data.length);
  const stroke = Math.max(6, Math.min(16, (size / 2 - 8) / count - 4));
  const step = stroke + 4;
  const outer = size / 2 - stroke / 2 - 2;

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height, width: "100%", alignItems: "center", justifyContent: "center" }}
    >
      {data.length > 0 ? (
        <Svg width={size} height={size}>
          {data.map((ring, index) => {
            const radius = outer - index * step;
            if (radius <= 0) return null;
            const fraction = Math.min(1, Math.max(0, ring.fraction));
            return (
              <G key={ring.label}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={colors.surfaceVariant}
                  strokeWidth={stroke}
                  fill="none"
                />
                {fraction > 0 ? (
                  <Path
                    d={arcPath(center, radius, fraction)}
                    stroke={ring.color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/** Caminho do arco a partir do topo (12h) no sentido horário; 100% vira um círculo completo. */
function arcPath(center: number, radius: number, fraction: number): string {
  if (fraction >= 0.9999) {
    return `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius}`;
  }
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  const x = center + radius * Math.cos(angle);
  const y = center + radius * Math.sin(angle);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${center} ${center - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y}`;
}
