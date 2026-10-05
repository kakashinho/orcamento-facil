import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { withAlpha, type Palette } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "danger" | "dangerOutlined";

export interface ButtonProps {
  label?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

function variantColors(variant: ButtonVariant, c: Palette) {
  switch (variant) {
    case "filled":
      return { bg: c.primary, fg: c.onPrimary, border: "transparent" };
    case "tonal":
      return { bg: c.secondaryContainer, fg: c.onSecondaryContainer, border: "transparent" };
    case "outlined":
      return { bg: "transparent", fg: c.primary, border: c.outline };
    case "text":
      return { bg: "transparent", fg: c.primary, border: "transparent" };
    case "danger":
      return { bg: c.error, fg: c.onError, border: "transparent" };
    case "dangerOutlined":
      return { bg: "transparent", fg: c.error, border: withAlpha(c.error, 0.5) };
  }
}

/** Botão Material 3 (filled, tonal, outlined, text) com estado de carregamento. */
export function Button({
  label,
  onPress,
  variant = "filled",
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const { bg, fg, border } = variantColors(variant, colors);
  const inactive = disabled || loading;
  const iconOnly = !!icon && !label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={{ color: withAlpha(fg === "transparent" ? colors.primary : fg, 0.12) }}
      style={[
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingHorizontal: iconOnly ? 0 : variant === "text" ? 16 : 24,
        },
        iconOnly && styles.iconOnly,
        fullWidth && styles.fullWidth,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          {label ? (
            <Text variant="body" weight="medium" color={fg} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 40,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconOnly: { width: 40 },
  fullWidth: { alignSelf: "stretch" },
  disabled: { opacity: 0.4 },
});
