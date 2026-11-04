import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

export interface BadgeProps {
  /** Quantidade exibida; zero (ou menos) esconde o selo. */
  count: number;
  /** Acima deste valor mostra "99+". */
  max?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Texto do selo: o número até `max` e, acima disso, "99+". */
export function badgeLabel(count: number, max = 99): string {
  const value = Math.max(0, Math.floor(count));
  return value > max ? `${max}+` : String(value);
}

/**
 * Selo numérico Material 3 (contador de avisos não lidos no sino — R22). Some com zero. É só visual:
 * quem o usa descreve a quantidade no rótulo de acessibilidade do botão.
 */
export function Badge({ count, max = 99, style, testID }: BadgeProps) {
  const { colors } = useTheme();
  if (!Number.isFinite(count) || count < 1) return null;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: colors.error }, style]}
    >
      <Text variant="caption" weight="medium" color="onError" maxFontSizeMultiplier={1} style={styles.text}>
        {badgeLabel(count, max)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 10, lineHeight: 14 },
});
