import type { IconName } from "@/ui/icons/icon-names";
import type { Category, MovementKind, TransactionType, WalletType } from "@/data/api/types";

/** Ícone de cada categoria predefinida (R07), pela `systemKey` fixa do backend. */
const CATEGORY_ICONS: Record<string, IconName> = {
  food: "restaurant",
  transport: "commute",
  leisure: "sports_esports",
  housing: "home",
  health: "favorite",
  education: "school",
  salary: "payments",
  other: "category",
};

/** Personalizadas (R08) recebem um ícone pelo nome, quando ele indica o assunto. */
const NAME_HINTS: [RegExp, IconName][] = [
  [/freela|projeto|trabalho|cliente/i, "work"],
  [/invest|rend|juro/i, "trending_up"],
  [/viag|hotel|passag/i, "language"],
  [/presente|doa/i, "star"],
  [/cart(ã|a)o/i, "credit_card"],
];

export function categoryIcon(category: Pick<Category, "systemKey" | "name"> | null | undefined): IconName {
  if (!category) return "category";
  if (category.systemKey && CATEGORY_ICONS[category.systemKey]) return CATEGORY_ICONS[category.systemKey];
  for (const [pattern, icon] of NAME_HINTS) if (pattern.test(category.name)) return icon;
  return "label";
}

/** Ícone por nome de categoria (respostas que trazem só id e nome, como as transações). */
export function categoryIconByName(name: string | null | undefined, categories: Category[] = []): IconName {
  if (!name) return "category";
  const match = categories.find((c) => c.name === name);
  return categoryIcon(match ?? { systemKey: null, name });
}

/** Rótulo e ícone dos tipos de carteira (R53). A cor deriva do tipo — o backend não guarda cor. */
export const WALLET_TYPES: { type: WalletType; label: string; icon: IconName; color: string }[] = [
  { type: "checking", label: "Conta corrente", icon: "account_balance", color: "#1560D4" },
  { type: "savings", label: "Poupança", icon: "savings", color: "#00629E" },
  { type: "cash", label: "Dinheiro", icon: "payments", color: "#386663" },
  { type: "investment", label: "Investimento", icon: "trending_up", color: "#5B3FBE" },
  { type: "credit_card", label: "Cartão de crédito", icon: "credit_card", color: "#8A05BE" },
  { type: "other", label: "Outra", icon: "account_balance_wallet", color: "#B56A00" },
];

export function walletTypeMeta(type: WalletType) {
  return WALLET_TYPES.find((w) => w.type === type) ?? WALLET_TYPES[WALLET_TYPES.length - 1];
}

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
};

/** Tags: sem "#", espaços repetidos unidos, até 40 caracteres (regra do backend). */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export const MAX_TAGS = 10;
