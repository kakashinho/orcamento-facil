import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  cursorQuery,
  dateRangeRule,
  idParams,
  isoDate,
  isoMonth,
  limitQuery,
  optionalText,
  positiveAmount,
  requiredText,
  responseDate,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { tagName } from "./tag.schema.js";

const TAGS = ["Transações"];

const transactionType = z.enum(["income", "expense"]).meta({ description: "income = receita; expense = despesa" });
const description = requiredText(200, "Informe a descrição.").meta({ example: "Supermercado" });
const tagNames = z
  .array(tagName)
  .max(10, "Use no máximo 10 tags.")
  .meta({ description: "Nomes das tags (R43); as inexistentes são criadas", example: ["casa", "mensal"] });
const archivedFilter = z
  .enum(["false", "true", "all"])
  .default("false")
  .meta({ description: "false: lista principal; true: só arquivadas; all: todas (R52)" });

// ---------- Request DTOs ----------

export const createTransactionRequestSchema = z.strictObject({
  type: transactionType,
  amount: positiveAmount,
  description,
  date: isoDate.optional().meta({ description: "Padrão: hoje, no fuso do usuário" }),
  walletId: uuid().optional().meta({ description: "Padrão: carteira padrão do usuário" }),
  categoryId: uuid()
    .nullable()
    .optional()
    .meta({ description: "Categoria compatível com o tipo (veja GET /api/categories?type=)" }),
  tags: tagNames.optional(),
});
export type CreateTransactionRequestDto = z.infer<typeof createTransactionRequestSchema>;

export const updateTransactionRequestSchema = z.strictObject({
  type: transactionType.optional(),
  amount: positiveAmount.optional(),
  description: description.optional(),
  date: isoDate.optional(),
  walletId: uuid().optional(),
  categoryId: uuid().nullable().optional().meta({ description: "null remove a categoria" }),
  tags: tagNames.optional().meta({ description: "Substitui o conjunto atual de tags" }),
  archived: z.boolean().optional(),
});
export type UpdateTransactionRequestDto = z.infer<typeof updateTransactionRequestSchema>;

export const duplicateTransactionRequestSchema = updateTransactionRequestSchema.omit({ archived: true }).default({});
export type DuplicateTransactionRequestDto = z.infer<typeof duplicateTransactionRequestSchema>;

/** Filtros de consulta (R10, R26, R52) — compartilhados pela listagem e pelo resumo. */
const filterFields = {
  q: optionalText(100).optional().meta({ description: "Busca na descrição, sem diferenciar acentos (R10)" }),
  categoryId: uuid().optional(),
  walletId: uuid().optional(),
  type: transactionType.optional(),
  tag: optionalText(40).optional().meta({ description: "Id ou nome da tag" }),
  from: isoDate.optional().meta({ description: "Data inicial (inclusive)" }),
  to: isoDate.optional().meta({ description: "Data final (inclusive)" }),
  month: isoMonth.optional().meta({ description: "Mês AAAA-MM (R26); combinado com from/to, vale a interseção" }),
  archived: archivedFilter,
};

export const transactionFiltersQuerySchema = z.strictObject(filterFields).superRefine(dateRangeRule("from", "to"));
export type TransactionFiltersQueryDto = z.infer<typeof transactionFiltersQuerySchema>;

export const listTransactionsQuerySchema = z
  .strictObject({
    ...filterFields,
    sort: z.enum(["date", "amount", "category"]).default("date").meta({ description: "Ordenação (R70)" }),
    order: z.enum(["asc", "desc"]).default("desc"),
    limit: limitQuery(),
    cursor: cursorQuery.optional(),
  })
  .superRefine(dateRangeRule("from", "to"));
export type ListTransactionsQueryDto = z.infer<typeof listTransactionsQuerySchema>;

export const transactionMonthsQuerySchema = z.strictObject({
  walletId: uuid().optional(),
  archived: archivedFilter,
});
export type TransactionMonthsQueryDto = z.infer<typeof transactionMonthsQuerySchema>;

export const archiveBeforeRequestSchema = z.strictObject({
  before: isoDate.meta({ description: "Arquiva as transações com data anterior a esta (exclusive)" }),
});
export type ArchiveBeforeRequestDto = z.infer<typeof archiveBeforeRequestSchema>;

export const parseTextRequestSchema = z.strictObject({
  text: requiredText(300, "Informe o texto reconhecido.").meta({ example: "gastei 35,90 no mercado ontem" }),
});
export type ParseTextRequestDto = z.infer<typeof parseTextRequestSchema>;

// ---------- Response DTOs ----------

export const transactionResponseSchema = z
  .object({
    id: responseId,
    type: transactionType,
    amount: z.number().meta({ description: "Valor positivo, na moeda da carteira" }),
    currency: z.string(),
    date: responseDate,
    description: z.string(),
    wallet: z.object({ id: responseId, name: z.string(), currency: z.string() }),
    category: z.object({ id: responseId, name: z.string(), predefined: z.boolean() }).nullable(),
    tags: z.array(z.object({ id: responseId, name: z.string() })),
    archived: z.boolean(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .meta({ id: "Transaction" });
export type TransactionResponseDto = z.infer<typeof transactionResponseSchema>;

export const transactionPageResponseSchema = z.object({
  data: z.array(transactionResponseSchema),
  nextCursor: z.string().nullable().meta({ description: "Envie em ?cursor= para a próxima página; null = fim" }),
});
export type TransactionPageResponseDto = z.infer<typeof transactionPageResponseSchema>;

const currencyTotals = z.object({
  currency: z.string(),
  income: z.number(),
  expense: z.number(),
  net: z.number(),
  count: z.number(),
});

export const transactionSummaryResponseSchema = z.object({
  count: z.number(),
  totals: z.array(currencyTotals).meta({ description: "Totais por moeda das carteiras" }),
  primaryCurrency: z.string(),
  converted: z
    .object({
      income: z.number(),
      expense: z.number(),
      net: z.number(),
      ratesUpdatedAt: responseTimestamp.nullable(),
      ratesStale: z.boolean(),
    })
    .nullable()
    .meta({ description: "Totais na moeda principal (R28, R29); nulo se faltar cotação" }),
});
export type TransactionSummaryResponseDto = z.infer<typeof transactionSummaryResponseSchema>;

export const transactionMonthsResponseSchema = z.object({
  data: z.array(z.object({ month: z.string().meta({ example: "2026-10" }), count: z.number() })),
});
export type TransactionMonthsResponseDto = z.infer<typeof transactionMonthsResponseSchema>;

export const archiveResultResponseSchema = z.object({ archived: z.number() });
export type ArchiveResultResponseDto = z.infer<typeof archiveResultResponseSchema>;

export const parsedTransactionResponseSchema = z.object({
  draft: z.object({
    type: transactionType,
    amount: z.number().nullable().meta({ description: "Nulo se nenhum valor foi reconhecido" }),
    date: responseDate,
    description: z.string(),
  }),
  suggestions: z.array(z.object({ categoryId: responseId, name: z.string(), confidence: z.number() })),
});
export type ParsedTransactionResponseDto = z.infer<typeof parsedTransactionResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const transactionRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar transações (R09, R10, R26, R52, R70)",
    description:
      "Ordem cronológica inversa por padrão, com rolagem infinita: envie `nextCursor` em `cursor` para a próxima página. Filtros por descrição, categoria, período, mês, carteira, tipo e tag; ordenação por data, valor ou categoria.",
    security: secured,
    querystring: listTransactionsQuerySchema,
    response: { 200: transactionPageResponseSchema },
  },
  summary: {
    tags: TAGS,
    summary: "Receitas, despesas e saldo do filtro (ex.: resumo do mês — R26)",
    description: "Totais por moeda e convertidos para a moeda principal do usuário.",
    security: secured,
    querystring: transactionFiltersQuerySchema,
    response: { 200: transactionSummaryResponseSchema },
  },
  months: {
    tags: TAGS,
    summary: "Meses com transações, do mais recente ao mais antigo (navegação do R26)",
    security: secured,
    querystring: transactionMonthsQuerySchema,
    response: { 200: transactionMonthsResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Registrar transação (R06)",
    description:
      "Valor, data, descrição e tipo (receita/despesa). Carteira: a informada ou a padrão. Data: hoje, se omitida. A categoria precisa aceitar o tipo (422 CATEGORY_TYPE_MISMATCH). Atualiza o saldo da carteira.",
    security: secured,
    body: createTransactionRequestSchema,
    response: { 201: transactionResponseSchema },
  },
  parse: {
    tags: TAGS,
    summary: "Interpretar frase falada em rascunho de transação (apoio ao R65)",
    description:
      'O app converte o áudio em texto (ex.: "gastei 35,90 no mercado ontem") e envia aqui; a resposta traz o rascunho e categorias sugeridas compatíveis com o tipo (R44). Nada é gravado.',
    security: secured,
    body: parseTextRequestSchema,
    response: { 200: parsedTransactionResponseSchema },
  },
  archiveBefore: {
    tags: TAGS,
    summary: "Arquivar transações antigas em lote (R52)",
    description: "Arquiva todas as transações com data anterior a `before`. Elas saem da lista principal mas continuam consultáveis.",
    security: secured,
    body: archiveBeforeRequestSchema,
    response: { 200: archiveResultResponseSchema },
  },
  get: {
    tags: TAGS,
    summary: "Detalhar transação",
    security: secured,
    params: idParams,
    response: { 200: transactionResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Editar transação (R11)",
    description: "Envie apenas os campos alterados. `tags` substitui o conjunto atual; `categoryId: null` remove a categoria.",
    security: secured,
    params: idParams,
    body: updateTransactionRequestSchema,
    response: { 200: transactionResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir transação (R12)",
    description: "A confirmação é feita no app. A exclusão pode ser desfeita em POST /api/history/undo (R49).",
    security: secured,
    params: idParams,
  },
  duplicate: {
    tags: TAGS,
    summary: "Duplicar transação (R48)",
    description: "Cria uma cópia com a data de hoje. Campos enviados no corpo substituem os da original.",
    security: secured,
    params: idParams,
    body: duplicateTransactionRequestSchema,
    response: { 201: transactionResponseSchema },
  },
  archive: {
    tags: TAGS,
    summary: "Arquivar transação (R52)",
    security: secured,
    params: idParams,
    response: { 200: transactionResponseSchema },
  },
  unarchive: {
    tags: TAGS,
    summary: "Desarquivar transação",
    security: secured,
    params: idParams,
    response: { 200: transactionResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
