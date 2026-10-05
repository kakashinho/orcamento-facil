import { StyleSheet, TextInput, View } from "react-native";
import { currencySymbol } from "@/domain/money";
import { fontFamilies, radii, Text, useTheme, withAlpha } from "@/ui";

export type AmountTone = "income" | "expense" | "neutral";

/** Campo grande de valor do protótipo (fundo conforme receita/despesa, número em Roboto Mono). */
export function AmountInput({
  label,
  value,
  onChangeText,
  currency,
  tone,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  currency: string;
  tone: AmountTone;
  error?: string | null;
}) {
  const { colors } = useTheme();
  const palette = {
    income: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
    expense: { bg: colors.errorContainer, fg: colors.onErrorContainer },
    neutral: { bg: colors.surfaceVariant, fg: colors.onSurface },
  }[tone];
  const symbol = currencySymbol(currency);
  return (
    <View>
      <View
        style={[
          styles.box,
          { backgroundColor: palette.bg },
          error ? { borderColor: colors.error, borderWidth: 2 } : null,
        ]}
      >
        <Text variant="caption" weight="medium" color={palette.fg}>
          {label} ({symbol})
        </Text>
        <View style={styles.row}>
          <Text variant="titleMedium" color={palette.fg}>
            {symbol}
          </Text>
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={withAlpha(palette.fg, 0.4)}
            selectionColor={colors.primary}
            maxFontSizeMultiplier={1.2}
            style={[styles.input, { color: palette.fg, fontFamily: fontFamilies.mono }]}
          />
        </View>
      </View>
      {error ? (
        <Text variant="label" color="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.lg, paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  input: { flex: 1, fontSize: 30, paddingVertical: 0 },
  error: { marginTop: 4, paddingHorizontal: 4 },
});
