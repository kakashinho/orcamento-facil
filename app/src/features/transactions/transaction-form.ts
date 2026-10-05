import type {
  Category,
  CreateTransactionRequest,
  Transaction,
  TransactionType,
  UpdateTransactionRequest,
} from "@/data/api/types";
import { formatAmountInput, parseAmountInput } from "@/domain/money";

/** Estado do formulário de transação (registrar R06 / editar R11). */
export interface TransactionFormValues {
  type: TransactionType;
  amountText: string;
  description: string;
  walletId: string | null;
  categoryId: string | null;
  date: string;
  tags: string[];
}

export function initialFormValues(
  editing: Transaction | null,
  defaults: { walletId: string | null; today: string },
): TransactionFormValues {
  if (editing) {
    return {
      type: editing.type,
      amountText: formatAmountInput(editing.amount),
      description: editing.description,
      walletId: editing.wallet.id,
      categoryId: editing.category?.id ?? null,
      date: editing.date,
      tags: editing.tags.map((t) => t.name),
    };
  }
  return {
    type: "expense",
    amountText: "",
    description: "",
    walletId: defaults.walletId,
    categoryId: null,
    date: defaults.today,
    tags: [],
  };
}

export type TransactionFormErrors = Partial<
  Record<"amount" | "description" | "category" | "wallet" | "date" | "tags", string>
>;

/** Validação local antes do envio; o servidor confere de novo (DTO + regras). */
export function validateTransactionForm(values: TransactionFormValues): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  const amount = parseAmountInput(values.amountText);
  if (amount === null) errors.amount = "Informe um valor válido, com até duas casas decimais.";
  else if (amount <= 0) errors.amount = "O valor deve ser maior que zero.";
  if (!values.categoryId) errors.category = "Escolha uma categoria.";
  if (values.description.trim().length > 200) errors.description = "Use no máximo 200 caracteres.";
  if (!values.walletId) errors.wallet = "Escolha a carteira.";
  return errors;
}

/** Descrição vazia usa o nome da categoria, como no protótipo (a API exige descrição). */
function descriptionOf(values: TransactionFormValues, categories: Category[]): string {
  const text = values.description.trim();
  if (text) return text;
  return categories.find((c) => c.id === values.categoryId)?.name ?? "Transação";
}

export function toCreateRequest(values: TransactionFormValues, categories: Category[]): CreateTransactionRequest {
  return {
    type: values.type,
    amount: parseAmountInput(values.amountText) ?? 0,
    description: descriptionOf(values, categories),
    date: values.date,
    ...(values.walletId ? { walletId: values.walletId } : {}),
    categoryId: values.categoryId,
    tags: values.tags,
  };
}

/** Só os campos alterados — requisição menor (R86) e histórico de desfazer preciso (R49). */
export function toUpdateRequest(
  original: Transaction,
  values: TransactionFormValues,
  categories: Category[],
): UpdateTransactionRequest {
  const body: UpdateTransactionRequest = {};
  const amount = parseAmountInput(values.amountText);
  const description = descriptionOf(values, categories);
  if (values.type !== original.type) body.type = values.type;
  if (amount !== null && amount !== original.amount) body.amount = amount;
  if (description !== original.description) body.description = description;
  if (values.date !== original.date) body.date = values.date;
  if (values.walletId && values.walletId !== original.wallet.id) body.walletId = values.walletId;
  if (values.categoryId !== (original.category?.id ?? null)) body.categoryId = values.categoryId;
  const before = original.tags
    .map((t) => t.name)
    .sort()
    .join("\n");
  const after = [...values.tags].sort().join("\n");
  if (before !== after) body.tags = values.tags;
  return body;
}

/** Converte `details[].path` da API nos campos do formulário. */
export function mapServerFieldErrors(fields: Record<string, string>): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  for (const [path, message] of Object.entries(fields)) {
    if (path === "amount") errors.amount = message;
    else if (path === "description") errors.description = message;
    else if (path === "categoryId") errors.category = message;
    else if (path === "walletId") errors.wallet = message;
    else if (path === "date") errors.date = message;
    else if (path.startsWith("tags")) errors.tags = message;
  }
  return errors;
}

/** Categoria aceita o tipo da transação? (null = receitas e despesas). */
export function categoryAccepts(category: Pick<Category, "type"> | undefined, type: TransactionType): boolean {
  return !category || category.type === null || category.type === type;
}
