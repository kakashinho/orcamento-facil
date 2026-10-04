export interface TagWithUsage {
  id: string;
  name: string;
  /** Quantidade de transações ativas com a tag. */
  transactionCount: number;
}

export const MAX_TAGS_PER_TRANSACTION = 10;

/** "  Viagem   SP " → "Viagem SP" */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
