import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import {
  categoryRef,
  idParams,
  isoDate,
  isoMonth,
  limitQuery,
  positiveAmount,
  secured,
  tagRef,
  walletRef,
} from "../../http/schemas.js";
import { todayInTimeZone } from "../../shared/dates.js";
import { parseTransactionText } from "./transaction-text-parser.js";

const transactionType = z.enum(["income", "expense"]).meta({ description: "income = receita, expense = despesa" });

export const transactionResponse = z
  .object({
    id: z.string(),
    type: transactionType,
    amount: z.number().meta({ description: "Valor positivo, na moeda da carteira" }),
    currency: z.string(),
    date: z.string(),
    description: z.string(),
    wallet: walletRef.extend({ id: z.string() }),
    category: categoryRef.extend({ id: z.string() }).nullable(),
    tags: z.array(tagRef.extend({ id: z.string() })),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Transaction" });

const description = z.string().min(1).max(200).meta({ example: "Supermercado" });
const tagsInput = z
  .array(z.string().min(1).max(40))
  .max(10)
  .meta({ description: "Nomes das tags (R43); as inexistentes são criadas", example: ["casa", "mensal"] });

const filterQuery = {
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

export function transactionRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { transactions, transactionQueries, categories, db, clock } = deps.container;

  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/",
      {
        schema: {
          tags: ["Transações"],
          summary: "Listar transações (R09, R10, R26, R52, R70)",
          description:
            "Ordem cronológica inversa por padrão, com rolagem infinita: envie `nextCursor` em `cursor` para a próxima página. Filtros por descrição, categoria, período, mês, carteira, tipo e tag; ordenação por data, valor ou categoria.",
          security: secured,
          querystring: z.object({
            ...filterQuery,
            sort: z.enum(["date", "amount", "category"]).default("date"),
            order: z.enum(["asc", "desc"]).default("desc"),
            limit: limitQuery,
            cursor: z.string().max(500).optional(),
          }),
          response: { 200: z.object({ data: z.array(transactionResponse), nextCursor: z.string().nullable() }) },
        },
      },
      async (request) => transactionQueries.list(requireAuth(request).userId, request.query),
    );

    app.get(
      "/summary",
      {
        schema: {
          tags: ["Transações"],
          summary: "Totais de receitas e despesas do filtro, por moeda (ex.: resumo do mês)",
          security: secured,
          querystring: z.object(filterQuery),
          response: {
            200: z.object({
              count: z.number(),
              totals: z.array(
                z.object({ currency: z.string(), income: z.number(), expense: z.number(), net: z.number(), count: z.number() }),
              ),
            }),
          },
        },
      },
      async (request) => transactionQueries.summary(requireAuth(request).userId, request.query),
    );

    app.post(
      "/",
      {
        schema: {
          tags: ["Transações"],
          summary: "Registrar transação (R06)",
          description:
            "Valor, data, descrição e tipo (receita/despesa). Carteira: a informada ou a padrão. Data: hoje, se omitida. Atualiza o saldo da carteira.",
          security: secured,
          body: z.object({
            type: transactionType,
            amount: positiveAmount,
            description,
            date: isoDate.optional(),
            walletId: z.uuid().optional(),
            categoryId: z.uuid().nullable().optional(),
            tags: tagsInput.optional(),
          }),
          response: { 201: transactionResponse },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await transactions.create(requireAuth(request).userId, request.body)),
    );

    app.post(
      "/parse",
      {
        schema: {
          tags: ["Transações"],
          summary: "Interpretar frase falada em rascunho de transação (apoio ao R65)",
          description:
            'O app converte o áudio em texto (ex.: "gastei 35,90 no mercado ontem") e envia aqui; a resposta traz o rascunho e categorias sugeridas (R44). Nada é gravado.',
          security: secured,
          body: z.object({ text: z.string().min(1).max(300) }),
          response: {
            200: z.object({
              draft: z.object({
                type: transactionType,
                amount: z.number().nullable(),
                date: z.string(),
                description: z.string(),
              }),
              suggestions: z.array(z.object({ categoryId: z.string(), name: z.string(), confidence: z.number() })),
            }),
          },
        },
      },
      async (request) => {
        const { userId } = requireAuth(request);
        const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
        const draft = parseTransactionText(request.body.text, todayInTimeZone(clock.now(), user?.timezone ?? "America/Sao_Paulo"));
        const suggestions = await categories.suggest(userId, draft.description);
        return {
          draft,
          suggestions: suggestions.map(({ categoryId, name, confidence }) => ({ categoryId, name, confidence })),
        };
      },
    );

    app.post(
      "/archive",
      {
        schema: {
          tags: ["Transações"],
          summary: "Arquivar transações antigas em lote (R52)",
          description: "Arquiva todas as transações com data anterior a `before`. Elas saem da lista principal mas continuam consultáveis.",
          security: secured,
          body: z.object({ before: isoDate }),
          response: { 200: z.object({ archived: z.number() }) },
        },
      },
      async (request) => transactions.archiveBefore(requireAuth(request).userId, request.body.before),
    );

    app.get(
      "/:id",
      {
        schema: { tags: ["Transações"], summary: "Detalhar transação", security: secured, params: idParams, response: { 200: transactionResponse } },
      },
      async (request) => transactionQueries.get(requireAuth(request).userId, request.params.id),
    );

    app.patch(
      "/:id",
      {
        schema: {
          tags: ["Transações"],
          summary: "Editar transação (R11)",
          description: "Envie apenas os campos alterados. `tags` substitui o conjunto atual; `categoryId: null` remove a categoria.",
          security: secured,
          params: idParams,
          body: z.object({
            type: transactionType.optional(),
            amount: positiveAmount.optional(),
            description: description.optional(),
            date: isoDate.optional(),
            walletId: z.uuid().optional(),
            categoryId: z.uuid().nullable().optional(),
            tags: tagsInput.optional(),
            archived: z.boolean().optional(),
          }),
          response: { 200: transactionResponse },
        },
      },
      async (request) => transactions.update(requireAuth(request).userId, request.params.id, request.body),
    );

    app.delete(
      "/:id",
      {
        schema: {
          tags: ["Transações"],
          summary: "Excluir transação (R12)",
          description: "A confirmação é feita no app. A exclusão pode ser desfeita em POST /api/history/undo (R49).",
          security: secured,
          params: idParams,
        },
      },
      async (request, reply) => {
        await transactions.delete(requireAuth(request).userId, request.params.id);
        return reply.status(204).send();
      },
    );

    app.post(
      "/:id/duplicate",
      {
        schema: {
          tags: ["Transações"],
          summary: "Duplicar transação (R48)",
          description: "Cria uma cópia com a data de hoje. Campos enviados no corpo substituem os da original.",
          security: secured,
          params: idParams,
          body: z
            .object({
              type: transactionType.optional(),
              amount: positiveAmount.optional(),
              description: description.optional(),
              date: isoDate.optional(),
              walletId: z.uuid().optional(),
              categoryId: z.uuid().nullable().optional(),
              tags: tagsInput.optional(),
            })
            .default({}),
          response: { 201: transactionResponse },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await transactions.duplicate(requireAuth(request).userId, request.params.id, request.body ?? {})),
    );

    app.post(
      "/:id/archive",
      {
        schema: {
          tags: ["Transações"],
          summary: "Arquivar transação (R52)",
          security: secured,
          params: idParams,
          response: { 200: transactionResponse },
        },
      },
      async (request) => transactions.setArchived(requireAuth(request).userId, request.params.id, true),
    );

    app.post(
      "/:id/unarchive",
      {
        schema: {
          tags: ["Transações"],
          summary: "Desarquivar transação",
          security: secured,
          params: idParams,
          response: { 200: transactionResponse },
        },
      },
      async (request) => transactions.setArchived(requireAuth(request).userId, request.params.id, false),
    );
  };
}
