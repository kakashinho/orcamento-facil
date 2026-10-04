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

/** Transação gravada, com valor decifrado e ids das tags. */
export interface TransactionRecord extends TransactionState {
  id: string;
  userId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Leitura completa para a resposta da API: carteira, categoria e tags resolvidas. */
export interface TransactionDetails {
  id: string;
  type: TransactionType;
  amountCents: number;
  currency: string;
  date: string;
  description: string;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string; predefined: boolean } | null;
  tags: Array<{ id: string; name: string }>;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ArchivedFilter = "false" | "true" | "all";
export type SortOrder = "asc" | "desc";

/** Filtros estruturados que o service entrega ao repository (R10, R26, R52). */
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

/** Posição na lista ordenada por data (paginação por keyset). */
export interface DateCursor {
  date: string;
  createdAt: string;
  id: string;
}

/** Movimento para relatórios — contrato público do finance para o módulo reports. */
export interface TransactionMovement {
  id: string;
  type: TransactionType;
  amountCents: number;
  date: string;
  createdAt: Date;
  description: string;
  walletId: string;
  category: { id: string; name: string } | null;
}

export interface MovementRange {
  from?: string | undefined;
  to?: string | undefined;
  /** Somente movimentos com data anterior (saldo de abertura). */
  before?: string | undefined;
  walletId?: string | undefined;
  type?: TransactionType | undefined;
}
