import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useCategories, useSetCategoryVisibility } from "@/data/queries/finance";
import { categoryIcon } from "@/domain/catalog";
import { Banner, Icon, Sheet, Switch, Text, useTheme } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";

/** Escolhe quais categorias aparecem nos gráficos e listas por categoria (R46). */
export function CategoryVisibilitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { showSnackbar } = useFeedback();
  const categories = (useCategories().data ?? []).filter((category) => category.type !== "income");
  const setVisibility = useSetCategoryVisibility();
  // Estado otimista: o interruptor muda na hora; se a API recusar, volta e avisa.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const toggle = (id: string, visible: boolean) => {
    setPending((current) => ({ ...current, [id]: !visible }));
    setVisibility.mutate(
      { id, hidden: !visible },
      {
        onSettled: () =>
          setPending((current) => {
            const { [id]: _done, ...rest } = current;
            return rest;
          }),
        onError: (error) => showSnackbar(errorMessage(error, "Não foi possível alterar a categoria.")),
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Categorias exibidas" testID="category-visibility">
      <View style={styles.content}>
        <Banner icon="info" tone="info">
          Categorias ocultas saem dos gráficos. Saldos e totais continuam completos.
        </Banner>
        {categories.map((category, index) => {
          const hidden = pending[category.id] ?? category.hiddenInReports;
          return (
            <View
              key={category.id}
              style={[
                styles.row,
                index < categories.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
              ]}
            >
              <Icon name={categoryIcon(category)} size={20} />
              <Text style={styles.name} numberOfLines={1}>
                {category.name}
              </Text>
              <Switch
                value={!hidden}
                onValueChange={(visible) => toggle(category.id, visible)}
                accessibilityLabel={`Exibir ${category.name} nos relatórios`}
              />
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  name: { flex: 1 },
});
