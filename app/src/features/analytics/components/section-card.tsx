import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { Button, Card, Skeleton, Text, useTheme } from "@/ui";
import { ShareButton } from "../share-button";

/**
 * Cartão de seção com título, ação opcional e os estados de carregamento e erro ("Tentar novamente").
 * Com `share`, ganha o botão "Compartilhar" (R30): a área do cartão vira uma imagem com o título, o
 * período e o rodapé "Orçamento Fácil".
 */
export function SectionCard({
  title,
  action,
  loading = false,
  error,
  onRetry,
  children,
  skeletonHeight = 120,
  share,
  testID,
}: {
  title: string;
  action?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Conteúdo; como função, recebe `true` durante a captura da imagem (para mostrar tudo, sem rolagem). */
  children?: ReactNode | ((capturing: boolean) => ReactNode);
  skeletonHeight?: number;
  /** Período mostrado na imagem compartilhada ("Outubro de 2026", "Últimos 30 dias"…). */
  share?: { period: string };
  testID?: string;
}) {
  const { colors } = useTheme();
  const area = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const ready = !loading && !error;
  return (
    <Card style={styles.card} testID={testID}>
      {/* `collapsable={false}`: o Android mantém a View nativa, que é a área capturada. */}
      <View ref={area} collapsable={false} style={[styles.area, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Text weight="medium" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {action}
          {share && ready && !capturing ? <ShareButton target={area} title={title} onCapturing={setCapturing} /> : null}
        </View>
        {loading ? (
          <Skeleton style={{ height: skeletonHeight }} />
        ) : error ? (
          <View style={styles.error}>
            <Text variant="bodySmall" color="onSurfaceVariant">
              {errorMessage(error)}
            </Text>
            {onRetry ? <Button variant="text" icon="refresh" label="Tentar novamente" onPress={onRetry} /> : null}
          </View>
        ) : typeof children === "function" ? (
          children(capturing)
        ) : (
          children
        )}
        {share && capturing ? (
          <Text variant="caption" color="onSurfaceVariant" testID="share-footer">
            {share.period} · Orçamento Fácil
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0 },
  area: { padding: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 32 },
  title: { flex: 1 },
  error: { alignItems: "flex-start", gap: 4 },
});
