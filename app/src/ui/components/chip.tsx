import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { withAlpha } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Ícone à direita (ex.: "close" para remover um filtro ativo). */
  trailingIcon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Chip de filtro Material 3: marcado mostra "check" e fundo secondary-container. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  trailingIcon,
  disabled,
  style,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const { colors } = useTheme();
  const fg = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: withAlpha(fg, 0.12) }}
      style={[
        styles.base,
        selected
          ? { backgroundColor: colors.secondaryContainer, borderColor: "transparent" }
          : { borderColor: colors.outlineVariant },
        disabled && styles.disabled,
        style,
      ]}
    >
      {selected ? <Icon name="check" size={16} color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text variant="bodySmall" weight="medium" color={fg} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? <Icon name={trailingIcon} size={16} color={fg} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  disabled: { opacity: 0.4 },
});
