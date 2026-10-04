import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  cursorQuery,
  dateRangeRule,
  idParams,
  isoDate,
  limitQuery,
  optionalText,
  positiveAmount,
  responseDate,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Transferências"];

// ---------- Request DTOs ----------

export const createTransferRequestSchema = z
  .strictObject({
    sourceWalletId: uuid(),
    targetWalletId: uuid(),
    amount: positiveAmount.meta({ description: "Valor debitado, na moeda da carteira de origem" }),
    targetAmount: positiveAmount.optional().meta({
      description:
        "Valor creditado, na moeda de destino. Só entre moedas diferentes; omitido, usa a cotação atual (R29)",
    }),
    date: isoDate.optional().meta({ description: "Padrão: hoje, no fuso do usuário" }),
    description: optionalText(200).optional(),
  })
  .refine((body) => body.sourceWalletId !== body.targetWalletId, {
    message: "Escolha uma carteira de destino diferente da origem.",
    path: ["targetWalletId"],
  });
export type CreateTransferRequestDto = z.infer<typeof createTransferRequestSchema>;

/** Cabeçalhos não são estritos: proxies e o próprio app enviam vários outros. */
export const idempotencyHeadersSchema = z.object({
  "idempotency-key": z
    .string()
    .trim()
    .min(8, "Idempotency-Key deve ter pelo menos 8 caracteres.")
    .max(100, "Idempotency-Key deve ter no máximo 100 caracteres.")
    .optional()
    .meta({ description: "Chave única por tentativa (ex.: UUID): repetir a requisição devolve a mesma transferência" }),
});

export const listTransfersQuerySchema = z
  .strictObject({
    walletId: uuid().optional().meta({ description: "Transferências que saem ou entram nesta carteira" }),
    from: isoDate.optional(),
    to: isoDate.optional(),
    limit: limitQuery(),
    cursor: cursorQuery.optional(),
  })
  .superRefine(dateRangeRule("from", "to"));
export type ListTransfersQueryDto = z.infer<typeof listTransfersQuerySchema>;

// ---------- Response DTOs ----------

const walletSummary = z.object({ id: responseId, name: z.string(), currency: z.string() });

export const transferResponseSchema = z
  .object({
    id: responseId,
    sourceWallet: walletSummary,
    targetWallet: walletSummary,
    amount: z.number().meta({ description: "Valor debitado, na moeda da carteira de origem" }),
    targetAmount: z.number().meta({ description: "Valor creditado, na moeda da carteira de destino" }),
    exchangeRate: z.number().nullable().meta({ description: "Taxa aplicada quando as moedas diferem" }),
    date: responseDate,
    description: z.string().nullable(),
    createdAt: responseTimestamp,
  })
  .meta({ id: "Transfer" });
export type TransferResponseDto = z.infer<typeof transferResponseSchema>;

export const transferPageResponseSchema = z.object({
  data: z.array(transferResponseSchema),
  nextCursor: z.string().nullable().meta({ description: "Envie em ?cursor= para a próxima página; null = fim" }),
});
export type TransferPageResponseDto = z.infer<typeof transferPageResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const transferRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar transferências entre carteiras",
    description: "Mais recentes primeiro, com rolagem infinita (`nextCursor`).",
    security: secured,
    querystring: listTransfersQuerySchema,
    response: { 200: transferPageResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Transferir entre carteiras (R54)",
    description:
      "Debita a origem e credita o destino atomicamente, sem gerar receita ou despesa. Entre moedas diferentes, converte pela cotação atual (R29) ou usa `targetAmount`, se informado. Envie o cabeçalho `Idempotency-Key` para tornar repetições seguras: 201 ao criar, 200 ao repetir.",
    security: secured,
    headers: idempotencyHeadersSchema,
    body: createTransferRequestSchema,
    response: { 200: transferResponseSchema, 201: transferResponseSchema },
  },
  get: {
    tags: TAGS,
    summary: "Detalhar transferência",
    security: secured,
    params: idParams,
    response: { 200: transferResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir transferência (estorna os saldos; pode ser desfeita)",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
