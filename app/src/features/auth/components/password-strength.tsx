import { StyleSheet, View } from "react-native";
import { passwordStrength, STRENGTH_LABELS } from "@/domain/password-policy";
import { radii, Text, useTheme } from "@/ui";

/** Medidor de força da senha (4 barras), como no protótipo. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { colors } = useTheme();
  if (!password) return null;
  const score = passwordStrength(password);
  return (
    <View style={styles.root} accessibilityLabel={`Força da senha: ${STRENGTH_LABELS[score]}`}>
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i < score ? colors.primary : colors.outlineVariant }]} />
        ))}
      </View>
      <Text variant="caption" color="onSurfaceVariant">
        Força da senha: {STRENGTH_LABELS[score]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: -8, paddingHorizontal: 4 },
  bars: { flexDirection: "row", gap: 4, marginBottom: 4 },
  bar: { flex: 1, height: 4, borderRadius: radii.full },
});
