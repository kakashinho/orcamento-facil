import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { radii, resolveColor, Text, useTheme, withAlpha, type Palette } from "@/ui";

/** Selo de estado ("Atenção", "Atingida") na cor do estado, com fundo translúcido. */
export function StateBadge({
  label,
  color,
  testID,
}: {
  label: string;
  color: keyof Palette | string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const resolved = resolveColor(colors, color);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: withAlpha(resolved, 0.14) }]}>
      <Text variant="caption" weight="medium" color={resolved} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Ícone redondo da categoria (ou do tipo de item) no início das linhas. */
export function ItemAvatar({ children, color }: { children: ReactNode; color?: string }) {
  const { colors } = useTheme();
  return <View style={[styles.avatar, { backgroundColor: color ?? colors.secondaryContainer }]}>{children}</View>;
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  avatar: { width: 40, height: 40, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
});
