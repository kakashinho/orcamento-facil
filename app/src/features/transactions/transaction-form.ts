import type {
  Category,
  CreateInstallmentsRequest,
  CreateRecurringRequest,
  CreateTransactionRequest,
  Frequency,
  Transaction,
  TransactionType,
  UpdateTransactionRequest,
} from "@/data/api/types";
import { formatAmountInput, parseAmountInput } from "@/domain/money";
import { parseInstallmentsInput, validateEndDate, validateInstallments } from "@/domain/series";

/** Estado do formulário de transação (registrar R06 / editar R11). */
export interface TransactionFormValues {
  type: TransactionType;
  amountText: string;
  description: string;
  walletId: string | null;
  categoryId: string | null;
  date: string;
  tags: string[];
  /** Observações (R57). */
  notes: string;
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
      notes: editing.notes ?? "",
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
    notes: "",
  };
}

export type TransactionFormErrors = Partial<
  Record<"amount" | "description" | "category" | "wallet" | "date" | "tags" | "notes", string>
>;

/** Limite das observações, igual ao do servidor. */
export const NOTES_MAX = 1000;

/** Validação local antes do envio; o servidor confere de novo (DTO + regras). */
export function validateTransactionForm(values: TransactionFormValues): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  const amount = parseAmountInput(values.amountText);
  if (amount === null) errors.amount = "Informe um valor válido, com até duas casas decimais.";
  else if (amount <= 0) errors.amount = "O valor deve ser maior que zero.";
  if (!values.categoryId) errors.category = "Escolha uma categoria.";
  if (values.description.trim().length > 200) errors.description = "Use no máximo 200 caracteres.";
  if (!values.walletId) errors.wallet = "Escolha a carteira.";
  if (values.notes.trim().length > NOTES_MAX) errors.notes = `Use no máximo ${NOTES_MAX} caracteres.`;
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
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
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
  const notes = values.notes.trim() || null;
  if (notes !== (original.notes ?? null)) body.notes = notes;
  return body;
}

/** Converte `details[].path` da API nos campos do formulário. */
export function mapServerFieldErrors(fields: Record<string, string>): TransactionFormErrors {
  const errors: TransactionFormErrors = {};
  for (const [path, message] of Object.entries(fields)) {
    if (path === "amount" || path === "totalAmount") errors.amount = message;
    else if (path === "description") errors.description = message;
    else if (path === "categoryId") errors.category = message;
    else if (path === "walletId") errors.wallet = message;
    else if (path === "date") errors.date = message;
    else if (path.startsWith("tags")) errors.tags = message;
    else if (path === "notes") errors.notes = message;
  }
  return errors;
}

/** Categoria aceita o tipo da transação? (null = receitas e despesas). */
export function categoryAccepts(category: Pick<Category, "type"> | undefined, type: TransactionType): boolean {
  return !category || category.type === null || category.type === type;
}

// ---------- repetir (R37) e parcelar (R62): só na criação ----------

export type RepeatChoice = "none" | Frequency;

/** Opções de repetição da transação nova, fora dos valores do formulário (a edição não as usa). */
export interface ScheduleValues {
  repeat: RepeatChoice;
  /** Data final opcional da recorrência (AAAA-MM-DD ou vazio). */
  endDate: string;
  /** Parcelar (só despesa); exclusivo com "Repetir". */
  installmentsOn: boolean;
  installmentsText: string;
}

export const INITIAL_SCHEDULE: ScheduleValues = {
  repeat: "none",
  endDate: "",
  installmentsOn: false,
  installmentsText: "2",
};

export type ScheduleMode = "single" | "recurring" | "installments";

/** Qual rota a criação usa: transação simples, recorrência ou parcelamento (só despesa). */
export function scheduleMode(type: TransactionType, schedule: ScheduleValues): ScheduleMode {
  if (type === "expense" && schedule.installmentsOn) return "installments";
  if (schedule.repeat !== "none") return "recurring";
  return "single";
}

export type ScheduleErrors = Partial<Record<"endDate" | "installments", string>>;

export function validateSchedule(values: TransactionFormValues, schedule: ScheduleValues): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const mode = scheduleMode(values.type, schedule);
  if (mode === "installments") {
    const message = validateInstallments(
      parseInstallmentsInput(schedule.installmentsText),
      parseAmountInput(values.amountText),
    );
    if (message) errors.installments = message;
  }
  if (mode === "recurring") {
    const message = validateEndDate(schedule.endDate, values.date);
    if (message) errors.endDate = message;
  }
  return errors;
}

/** Recorrência: o mesmo corpo da transação, com a frequência e a data final opcional. */
export function toRecurringRequest(
  values: TransactionFormValues,
  categories: Category[],
  schedule: ScheduleValues,
): CreateRecurringRequest {
  return {
    ...toCreateRequest(values, categories),
    frequency: schedule.repeat === "none" ? "monthly" : schedule.repeat,
    ...(schedule.endDate ? { endDate: schedule.endDate } : {}),
  };
}

/** Parcelamento: o valor digitado é o total, dividido pelo servidor (a sobra fica na 1ª parcela). */
export function toInstallmentsRequest(
  values: TransactionFormValues,
  categories: Category[],
  schedule: ScheduleValues,
): CreateInstallmentsRequest {
  const { amount, type: _type, ...rest } = toCreateRequest(values, categories);
  return {
    ...rest,
    totalAmount: amount,
    installments: parseInstallmentsInput(schedule.installmentsText) ?? 0,
    date: values.date,
  };
}

/** Erros por campo das rotas de série (`details[].path`). */
export function mapScheduleFieldErrors(fields: Record<string, string>): ScheduleErrors {
  const errors: ScheduleErrors = {};
  if (fields.endDate) errors.endDate = fields.endDate;
  if (fields.installments) errors.installments = fields.installments;
  return errors;
}

// ---------- destinar a uma meta (R17) ----------

/** Valor opcional destinado à meta: vazio = toda a receita; senão, entre 0 e o valor da receita. */
export function validateGoalAmount(amountText: string, transactionAmount: number | null): string | null {
  if (!amountText.trim()) return null;
  const amount = parseAmountInput(amountText);
  if (amount === null) return "Informe um valor válido, com até duas casas decimais.";
  if (amount <= 0) return "O valor deve ser maior que zero.";
  if (transactionAmount !== null && amount > transactionAmount) return "O valor passa do valor da receita.";
  return null;
}

/** Valor enviado no vínculo: undefined deixa o servidor usar todo o valor disponível da receita. */
export function goalAmountOf(amountText: string): number | undefined {
  return amountText.trim() ? (parseAmountInput(amountText) ?? undefined) : undefined;
}
