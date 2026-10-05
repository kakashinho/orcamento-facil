import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { withAlpha } from "../theme/colors";
import { elevation, radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

/** Botão de ação flutuante estendido (Material 3), na cor primary-container. */
export function FAB({
  icon,
  label,
  onPress,
  style,
  disabled,
  testID,
}: {
  icon: IconName;
  label?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label ?? icon}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: withAlpha(colors.onPrimaryContainer, 0.12) }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colors.primaryContainer,
          paddingHorizontal: label ? 20 : 0,
          width: label ? undefined : 56,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={icon} size={24} color={colors.onPrimaryContainer} />
      {label ? (
        <Text weight="medium" color={colors.onPrimaryContainer} style={styles.label}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: elevation.level3,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { paddingRight: 4 },
  pressed: { transform: [{ scale: 0.95 }] },
  disabled: { opacity: 0.5 },
});
