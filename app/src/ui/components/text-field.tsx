import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { withAlpha } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { IconButton } from "./icon-button";
import { Text } from "./text";

export interface TextFieldProps extends Omit<
  TextInputProps,
  "style" | "onChange" | "placeholderTextColor" | "multiline"
> {
  label: string;
  icon?: IconName;
  error?: string | null;
  /** Texto de ajuda exibido abaixo do campo quando não há erro. */
  helper?: string;
  trailing?: { icon: IconName; onPress: () => void; accessibilityLabel: string };
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Campo de texto "outlined" do protótipo: rótulo dentro do contorno, ícone à esquerda,
 * ação opcional à direita e mensagem de erro abaixo (vinda da validação local ou do `details` da API).
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, icon, error, helper, trailing, multiline = false, style, onFocus, onBlur, ...inputProps },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.outline;
  return (
    <View style={style}>
      <View
        style={[
          styles.container,
          multiline ? styles.multiline : styles.single,
          { borderColor, backgroundColor: colors.surface, borderWidth: focused || error ? 2 : 1 },
        ]}
      >
        {icon ? <Icon name={icon} size={20} style={multiline ? styles.iconTop : undefined} /> : null}
        <View style={styles.body}>
          <Text variant="caption" weight="medium" color={error ? "error" : "onSurfaceVariant"}>
            {label}
          </Text>
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={error ?? helper}
            placeholderTextColor={withAlpha(colors.onSurfaceVariant, 0.5)}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            multiline={multiline}
            numberOfLines={multiline ? 2 : 1}
            maxFontSizeMultiplier={1.3}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, { color: colors.onSurface }, multiline && styles.inputMultiline]}
            {...inputProps}
          />
        </View>
        {trailing ? (
          <IconButton
            name={trailing.icon}
            onPress={trailing.onPress}
            accessibilityLabel={trailing.accessibilityLabel}
          />
        ) : null}
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Icon name="error" size={14} color="error" />
          <Text variant="label" color="error" style={styles.messageText}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="label" color="onSurfaceVariant" style={styles.helper}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.xxl,
    paddingHorizontal: 12,
  },
  single: { minHeight: 56 },
  multiline: { alignItems: "flex-start", paddingVertical: 8 },
  iconTop: { marginTop: 10 },
  body: { flex: 1, justifyContent: "center", minWidth: 0, paddingVertical: 4 },
  input: { fontSize: 14, paddingVertical: 0, paddingHorizontal: 0, minHeight: 22 },
  inputMultiline: { minHeight: 40, textAlignVertical: "top" },
  message: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingHorizontal: 4 },
  messageText: { flex: 1 },
  helper: { marginTop: 4, paddingHorizontal: 4 },
});
