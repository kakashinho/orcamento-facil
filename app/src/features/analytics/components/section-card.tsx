import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { Button, Card, Skeleton, Text } from "@/ui";

/** Cartão de seção com título, ação opcional e os estados de carregamento e erro ("Tentar novamente"). */
export function SectionCard({
  title,
  action,
  loading = false,
  error,
  onRetry,
  children,
  skeletonHeight = 120,
  testID,
}: {
  title: string;
  action?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  children?: ReactNode;
  skeletonHeight?: number;
  testID?: string;
}) {
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.header}>
        <Text weight="medium" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {action}
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
      ) : (
        children
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 32 },
  title: { flex: 1 },
  error: { alignItems: "flex-start", gap: 4 },
});
