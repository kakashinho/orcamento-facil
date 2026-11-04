import { StyleSheet, View } from "react-native";
import type { Category } from "@/data/api/types";
import { categoryIcon } from "@/domain/catalog";
import { Chip, Text } from "@/ui";

/** Categorias de despesa ou de ambos os tipos: as únicas aceitas em orçamentos, reduções e metas (D-40). */
export function spendingCategories(categories: Category[]): Category[] {
  return categories.filter((category) => category.type !== "income");
}

/** Seleção de categoria por chips, com o erro do campo logo abaixo. */
export function CategoryChips({
  label = "Categoria",
  categories,
  value,
  onChange,
  error,
}: {
  label?: string;
  categories: Category[];
  value: string | null;
  onChange: (id: string) => void;
  error?: string | null;
}) {
  return (
    <View>
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        {label}
      </Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {categories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            icon={categoryIcon(category)}
            selected={value === category.id}
            onPress={() => onChange(category.id)}
          />
        ))}
      </View>
      {error ? (
        <Text variant="label" color="error" style={styles.label}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
});
