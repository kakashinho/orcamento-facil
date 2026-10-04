export type TransactionType = "income" | "expense";

/** Estado completo de uma transação — usado para gravar, comparar e desfazer (snapshot). */
export interface TransactionState {
  walletId: string;
  type: TransactionType;
  amountCents: number;
  date: string;
  description: string;
  categoryId: string | null;
  archived: boolean;
  tagIds: string[];
}

/** Efeito no saldo da carteira: receita soma, despesa subtrai. */
export function balanceEffect(state: Pick<TransactionState, "type" | "amountCents">): number {
  return state.type === "income" ? state.amountCents : -state.amountCents;
}

export function sameState(a: TransactionState, b: TransactionState): boolean {
  const sortedA = [...a.tagIds].sort().join(",");
  const sortedB = [...b.tagIds].sort().join(",");
  return (
    a.walletId === b.walletId &&
    a.type === b.type &&
    a.amountCents === b.amountCents &&
    a.date === b.date &&
    a.description === b.description &&
    a.categoryId === b.categoryId &&
    a.archived === b.archived &&
    sortedA === sortedB
  );
}

export interface TransactionDto {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  description: string;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string; predefined: boolean } | null;
  tags: Array<{ id: string; name: string }>;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ArchivedFilter = "false" | "true" | "all";
export type TransactionSort = "date" | "amount" | "category";
export type SortOrder = "asc" | "desc";

export interface TransactionFilters {
  q?: string | undefined;
  categoryId?: string | undefined;
  walletId?: string | undefined;
  type?: TransactionType | undefined;
  tag?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  month?: string | undefined;
  archived?: ArchivedFilter | undefined;
}

export interface TransactionListQuery extends TransactionFilters {
  sort?: TransactionSort | undefined;
  order?: SortOrder | undefined;
  limit: number;
  cursor?: string | undefined;
}
