import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Icon, Text, useTheme, withAlpha, type IconName } from "@/ui";

/** Cartão de uma seção das Preferências. */
export function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <Card style={styles.card} testID={testID}>
      <Text variant="bodySmall" weight="medium" color="onSurfaceVariant">
        {title}
      </Text>
      {children}
    </Card>
  );
}

/** Linha com ícone, título, subtítulo e um controle à direita; com `onPress`, vira botão. */
export function Row({
  icon,
  title,
  subtitle,
  children,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <Icon name={icon} size={22} />
      <View style={styles.rowText}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="label" color="onSurfaceVariant">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowText: { flex: 1 },
});
