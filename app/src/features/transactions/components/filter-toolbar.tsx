import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Icon, radii, Text, useTheme, withAlpha } from "@/ui";

/** Botão de filtros padronizado das abas Fluxo e Extrato (como no protótipo). */
export function FilterToolbar({ label, active, onOpen }: { label: string; active: number; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Filtros: ${label}${active ? `, ${active} ativos` : ""}`}
      onPress={onOpen}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={[styles.toolbar, { backgroundColor: colors.surfaceVariant }]}
    >
      <Icon name="tune" size={20} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {active > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text variant="caption" weight="medium" color="onPrimary">
            {active}
          </Text>
        </View>
      ) : null}
      <Icon name="expand_more" size={20} />
    </Pressable>
  );
}

/** Seção dentro da folha de filtros. */
export function FilterSection({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View>
      <Text variant="bodySmall" weight="medium">
        {label}
      </Text>
      {hint ? (
        <Text variant="label" color="onSurfaceVariant">
          {hint}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function FilterActions({ onClear, onApply }: { onClear: () => void; onApply: () => void }) {
  return (
    <View style={styles.actions}>
      <Button variant="text" label="Limpar" onPress={onClear} />
      <Button label="Aplicar" onPress={onApply} />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    height: 48,
    borderRadius: radii.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  label: { flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionBody: { paddingTop: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 8 },
});
