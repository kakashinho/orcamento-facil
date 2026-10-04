/** Tipo de transação que a categoria aceita; nulo = receitas e despesas (ex.: "Outros"). */
export const CATEGORY_TYPES = ["income", "expense"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

/** Predefinida (R07): `userId` nulo e `systemKey` preenchida. Personalizada (R08): pertence a um usuário. */
export interface Category {
  id: string;
  userId: string | null;
  systemKey: string | null;
  name: string;
  type: CategoryType | null;
  deletedAt: Date | null;
}

/** Uma categoria aceita a transação quando não tem tipo ou tem o mesmo tipo dela. */
export function acceptsType(category: Pick<Category, "type">, type: CategoryType): boolean {
  return category.type === null || category.type === type;
}

export const TYPE_LABEL: Record<CategoryType, { singular: string; plural: string }> = {
  income: { singular: "receita", plural: "receitas" },
  expense: { singular: "despesa", plural: "despesas" },
};
