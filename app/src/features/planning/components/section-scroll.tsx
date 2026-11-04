import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ContentContainer, FAB, useTheme, type IconName } from "@/ui";

/**
 * Corpo rolável de cada seção do Planejamento: puxar para atualizar e o botão flutuante da ação
 * principal (com folga no fim da lista para ele não cobrir o último item).
 */
export function SectionScroll({
  children,
  onRefresh,
  fab,
  testID,
}: {
  children: ReactNode;
  onRefresh: () => Promise<unknown>;
  fab?: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; testID?: string };
  testID?: string;
}) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <View style={styles.root} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.primary]} />}
      >
        <ContentContainer style={styles.content}>{children}</ContentContainer>
      </ScrollView>
      {fab ? (
        <FAB
          icon={fab.icon}
          label={fab.label}
          onPress={fab.onPress}
          disabled={fab.disabled}
          testID={fab.testID}
          style={styles.fab}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 104 },
  content: { gap: 16, paddingTop: 8 },
  fab: { position: "absolute", right: 16, bottom: 16 },
});
