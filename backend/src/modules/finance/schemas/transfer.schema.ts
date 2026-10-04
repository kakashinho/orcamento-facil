import type { FastifySchema } from "fastify";
import { z } from "zod";
import { idParams, isoDate, limitQuery, positiveAmount, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Transferências"];

// ---------- Request DTOs ----------

export const createTransferRequestSchema = z.object({
  sourceWalletId: z.uuid(),
  targetWalletId: z.uuid(),
  amount: positiveAmount,
  targetAmount: positiveAmount.optional(),
  date: isoDate.optional(),
  description: z.string().max(200).optional(),
});
export type CreateTransferRequestDto = z.infer<typeof createTransferRequestSchema>;

export const idempotencyHeadersSchema = z.object({ "idempotency-key": z.string().min(8).max(100).optional() });

export const listTransfersQuerySchema = z.object({
  walletId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: limitQuery,
  cursor: z.string().max(500).optional(),
});
export type ListTransfersQueryDto = z.infer<typeof listTransfersQuerySchema>;

// ---------- Response DTOs ----------

const walletSummary = z.object({ id: z.string(), name: z.string(), currency: z.string() });

export const transferResponseSchema = z
  .object({
    id: z.string(),
    sourceWallet: walletSummary,
    targetWallet: walletSummary,
    amount: z.number().meta({ description: "Valor debitado, na moeda da carteira de origem" }),
    targetAmount: z.number().meta({ description: "Valor creditado, na moeda da carteira de destino" }),
    exchangeRate: z.number().nullable().meta({ description: "Taxa aplicada quando as moedas diferem" }),
    date: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "Transfer" });
export type TransferResponseDto = z.infer<typeof transferResponseSchema>;

export const transferPageResponseSchema = z.object({
  data: z.array(transferResponseSchema),
  nextCursor: z.string().nullable(),
});
export type TransferPageResponseDto = z.infer<typeof transferPageResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const transferRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar transferências entre carteiras",
    security: secured,
    querystring: listTransfersQuerySchema,
    response: { 200: transferPageResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Transferir entre carteiras (R54)",
    description:
      "Debita a origem e credita o destino atomicamente, sem gerar receita ou despesa. Entre moedas diferentes, converte pela cotação atual (R29) ou usa `targetAmount`, se informado. Envie o cabeçalho `Idempotency-Key` para tornar repetições seguras.",
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
