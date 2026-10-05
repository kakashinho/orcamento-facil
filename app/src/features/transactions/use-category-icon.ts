import { useCallback } from "react";
import type { Transaction } from "@/data/api/types";
import { useCategories } from "@/data/queries/finance";
import { categoryIcon } from "@/domain/catalog";
import type { IconName } from "@/ui";

/** Resolve o ícone da categoria de uma transação usando a lista de categorias em cache. */
export function useCategoryIconResolver(): (
  category: Transaction["category"] | { id: string; name: string } | null,
) => IconName {
  const { data: categories } = useCategories();
  return useCallback(
    (category) => {
      if (!category) return "category";
      const known = categories?.find((c) => c.id === category.id);
      return categoryIcon(known ?? { systemKey: null, name: category.name });
    },
    [categories],
  );
}
