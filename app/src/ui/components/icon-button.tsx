import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { resolveColor, withAlpha, type Palette } from "../theme/colors";
import { useTheme } from "../theme/theme-provider";

export interface IconButtonProps {
  name: IconName;
  onPress?: () => void;
  /** Obrigatório: botões só com ícone precisam de rótulo para leitores de tela. */
  accessibilityLabel: string;
  color?: keyof Palette | (string & {});
  size?: number;
  fill?: boolean;
  disabled?: boolean;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Botão de ícone Material 3, alvo de toque mínimo de 40dp. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color = "onSurfaceVariant",
  size = 40,
  fill,
  disabled,
  bordered,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();
  const resolved = resolveColor(colors, color);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size < 40 ? (40 - size) / 2 : 0}
      android_ripple={{ color: withAlpha(resolved, 0.12), borderless: true, radius: size / 2 }}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        bordered && { borderWidth: 1, borderColor: colors.outline },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color={resolved} fill={fill} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
});
