import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  idParams,
  isoDate,
  isoMonth,
  limitQuery,
  positiveAmount,
  secured,
} from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Transações"];

const transactionType = z.enum(["income", "expense"]).meta({ description: "income = receita, expense = despesa" });
const description = z.string().min(1).max(200).meta({ example: "Supermercado" });
const tagNames = z
  .array(z.string().min(1).max(40))
  .max(10)
  .meta({ description: "Nomes das tags (R43); as inexistentes são criadas", example: ["casa", "mensal"] });

// ---------- Request DTOs ----------

export const createTransactionRequestSchema = z.object({
  type: transactionType,
  amount: positiveAmount,
  description,
  date: isoDate.optional(),
  walletId: z.uuid().optional(),
  categoryId: z.uuid().nullable().optional(),
  tags: tagNames.optional(),
});
export type CreateTransactionRequestDto = z.infer<typeof createTransactionRequestSchema>;

export const updateTransactionRequestSchema = z.object({
  type: transactionType.optional(),
  amount: positiveAmount.optional(),
  description: description.optional(),
  date: isoDate.optional(),
  walletId: z.uuid().optional(),
  categoryId: z.uuid().nullable().optional(),
  tags: tagNames.optional(),
  archived: z.boolean().optional(),
});
export type UpdateTransactionRequestDto = z.infer<typeof updateTransactionRequestSchema>;

export const duplicateTransactionRequestSchema = updateTransactionRequestSchema.omit({ archived: true }).default({});
export type DuplicateTransactionRequestDto = z.infer<typeof duplicateTransactionRequestSchema>;

/** Filtros de consulta (R10, R26, R52) — compartilhados pela listagem e pelo resumo. */
const filterFields = {
  q: z.string().max(100).optional().meta({ description: "Busca na descrição, sem diferenciar acentos (R10)" }),
  categoryId: z.uuid().optional(),
  walletId: z.uuid().optional(),
  type: transactionType.optional(),
  tag: z.string().max(40).optional().meta({ description: "Id ou nome da tag" }),
  from: isoDate.optional(),
  to: isoDate.optional(),
  month: isoMonth.optional().meta({ description: "Mês AAAA-MM (R26)" }),
  archived: z
    .enum(["false", "true", "all"])
    .default("false")
    .meta({ description: "false: lista principal; true: só arquivadas; all: todas (R52)" }),
};

export const transactionFiltersQuerySchema = z.object(filterFields);
export type TransactionFiltersQueryDto = z.infer<typeof transactionFiltersQuerySchema>;

export const listTransactionsQuerySchema = z.object({
  ...filterFields,
  sort: z.enum(["date", "amount", "category"]).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: limitQuery,
  cursor: z.string().max(500).optional(),
});
export type ListTransactionsQueryDto = z.infer<typeof listTransactionsQuerySchema>;

export const archiveBeforeRequestSchema = z.object({ before: isoDate });
export type ArchiveBeforeRequestDto = z.infer<typeof archiveBeforeRequestSchema>;

export const parseTextRequestSchema = z.object({ text: z.string().min(1).max(300) });
export type ParseTextRequestDto = z.infer<typeof parseTextRequestSchema>;

// ---------- Response DTOs ----------

export const transactionResponseSchema = z
  .object({
    id: z.string(),
    type: transactionType,
    amount: z.number().meta({ description: "Valor positivo, na moeda da carteira" }),
    currency: z.string(),
    date: z.string(),
    description: z.string(),
    wallet: z.object({ id: z.string(), name: z.string(), currency: z.string() }),
    category: z.object({ id: z.string(), name: z.string(), predefined: z.boolean() }).nullable(),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Transaction" });
export type TransactionResponseDto = z.infer<typeof transactionResponseSchema>;

export const transactionPageResponseSchema = z.object({
  data: z.array(transactionResponseSchema),
  nextCursor: z.string().nullable().meta({ description: "Envie em ?cursor= para a próxima página; null = fim" }),
});
export type TransactionPageResponseDto = z.infer<typeof transactionPageResponseSchema>;

export const transactionSummaryResponseSchema = z.object({
  count: z.number(),
  totals: z.array(
    z.object({ currency: z.string(), income: z.number(), expense: z.number(), net: z.number(), count: z.number() }),
  ),
});
export type TransactionSummaryResponseDto = z.infer<typeof transactionSummaryResponseSchema>;

export const archiveResultResponseSchema = z.object({ archived: z.number() });
export type ArchiveResultResponseDto = z.infer<typeof archiveResultResponseSchema>;

export const parsedTransactionResponseSchema = z.object({
  draft: z.object({
    type: transactionType,
    amount: z.number().nullable(),
    date: z.string(),
    description: z.string(),
  }),
  suggestions: z.array(z.object({ categoryId: z.string(), name: z.string(), confidence: z.number() })),
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
    summary: "Totais de receitas e despesas do filtro, por moeda (ex.: resumo do mês)",
    security: secured,
    querystring: transactionFiltersQuerySchema,
    response: { 200: transactionSummaryResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Registrar transação (R06)",
    description:
      "Valor, data, descrição e tipo (receita/despesa). Carteira: a informada ou a padrão. Data: hoje, se omitida. Atualiza o saldo da carteira.",
    security: secured,
    body: createTransactionRequestSchema,
    response: { 201: transactionResponseSchema },
  },
  parse: {
    tags: TAGS,
    summary: "Interpretar frase falada em rascunho de transação (apoio ao R65)",
    description:
      'O app converte o áudio em texto (ex.: "gastei 35,90 no mercado ontem") e envia aqui; a resposta traz o rascunho e categorias sugeridas (R44). Nada é gravado.',
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
