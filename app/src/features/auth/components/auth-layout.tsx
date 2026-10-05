import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Icon, radii, Text, useTheme } from "@/ui";

/** Estrutura das telas de acesso: marca no topo e conteúdo com largura limitada em tablets. */
export function AuthLayout({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 40 }]}
      >
        <View style={styles.column}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Icon name="savings" size={30} color="onPrimary" fill />
          </View>
          <Text variant="display" accessibilityRole="header">
            Orçamento Fácil
          </Text>
          <Text color="onSurfaceVariant" style={styles.subtitle}>
            {subtitle}
          </Text>
          <View style={styles.content}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Divisor "ou" entre o login por senha e por biometria. */
export function OrDivider() {
  const { colors } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.outlineVariant }]} />
      <Text variant="label" color="onSurfaceVariant">
        ou
      </Text>
      <View style={[styles.line, { backgroundColor: colors.outlineVariant }]} />
    </View>
  );
}

/** Marca de sucesso estática (conta criada, senha redefinida). */
export function SuccessMark() {
  const { colors } = useTheme();
  return (
    <View style={[styles.success, { backgroundColor: colors.primaryContainer }]}>
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
        <Path
          d="M4 12.5l5 5L20 6.5"
          stroke={colors.onPrimaryContainer}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28 },
  column: { width: "100%", maxWidth: 480, alignSelf: "center" },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  subtitle: { marginTop: 4 },
  content: { marginTop: 32, gap: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1 },
  success: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
});
