import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { withAlpha } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";

/** Cartão "outlined" do Material 3 usado em listas e resumos. */
export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const base = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: withAlpha(colors.outlineVariant, 0.6) },
    style,
  ];
  if (!onPress) {
    return (
      <View style={base} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={base}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, borderWidth: 1, overflow: "hidden" },
});
