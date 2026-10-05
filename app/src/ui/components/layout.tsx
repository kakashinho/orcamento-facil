import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useResponsiveLayout } from "../theme/breakpoints";
import { Text } from "./text";

/**
 * Centraliza o conteúdo com largura máxima em tablets (R82) e aplica a margem lateral da página.
 */
export function ContentContainer({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const layout = useResponsiveLayout();
  return (
    <View
      style={[
        styles.container,
        { maxWidth: layout.contentMaxWidth, paddingHorizontal: padded ? layout.gutter : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Título de seção com ação opcional à direita ("Ver todas"). */
export function SectionHeader({
  title,
  action,
  style,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <Text variant="title" weight="medium" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

/** Divide os itens em linhas de `columns` colunas (grade simples para tablets). */
export function Grid({ columns, gap = 12, children }: { columns: number; gap?: number; children: ReactNode[] }) {
  if (columns <= 1) return <View style={{ gap }}>{children}</View>;
  const rows: ReactNode[][] = [];
  children.forEach((child, index) => {
    const row = Math.floor(index / columns);
    (rows[row] ??= []).push(child);
  });
  return (
    <View style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { gap }]}>
          {row.map((child, i) => (
            <View key={i} style={styles.cell}>
              {child}
            </View>
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`empty-${i}`} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", alignSelf: "center" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row" },
  cell: { flex: 1 },
});
