import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { logger } from "@/core/logging/logger";
import { Button, Icon, radii, Text, useTheme } from "@/ui";

/**
 * Tela exibida quando uma tela quebra (ErrorBoundary do Expo Router). O erro é registrado (R85)
 * e o usuário pode tentar de novo sem fechar o app.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const { colors } = useTheme();
  useEffect(() => {
    logger.error("app.render_error", error);
  }, [error]);
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.badge, { backgroundColor: colors.errorContainer }]}>
        <Icon name="warning" size={32} color="onErrorContainer" />
      </View>
      <Text variant="titleLarge" align="center">
        Algo deu errado
      </Text>
      <Text color="onSurfaceVariant" align="center" style={styles.text}>
        Não foi possível exibir esta tela. O problema foi registrado; tente novamente.
      </Text>
      <Button icon="refresh" label="Tentar novamente" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  badge: { width: 72, height: 72, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  text: { maxWidth: 320, marginBottom: 8 },
});
