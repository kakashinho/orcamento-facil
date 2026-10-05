import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";

/** Switch Material 3 do protótipo: trilho 52×32 e indicador que cresce quando ligado. */
export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  testID,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const size = progress.interpolate({ inputRange: [0, 1], outputRange: [16, 24] });
  const left = progress.interpolate({ inputRange: [0, 1], outputRange: [6, 22] });

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={[
        styles.track,
        value
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: colors.surfaceVariant, borderColor: colors.outline },
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          {
            width: size,
            height: size,
            left,
            marginTop: Animated.multiply(size, -0.5),
            backgroundColor: value ? colors.onPrimary : colors.outline,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: radii.full, borderWidth: 2, justifyContent: "center" },
  thumb: { position: "absolute", top: "50%", borderRadius: radii.full },
  disabled: { opacity: 0.4 },
});
