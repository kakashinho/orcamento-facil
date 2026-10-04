import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, idParams, secured, signedAmount } from "../../../infrastructure/http/common-schemas.js";
import { WALLET_TYPES } from "../types/wallet.types.js";

const TAGS = ["Carteiras"];
const walletName = z.string().min(1).max(60).meta({ example: "Conta corrente" });

// ---------- Request DTOs ----------

export const createWalletRequestSchema = z.object({
  name: walletName,
  type: z.enum(WALLET_TYPES).optional(),
  currency: currencyCode.optional().meta({ description: "Padrão: moeda principal do usuário" }),
  initialBalance: signedAmount.optional(),
  isDefault: z.boolean().optional(),
});
export type CreateWalletRequestDto = z.infer<typeof createWalletRequestSchema>;

export const updateWalletRequestSchema = z.object({
  name: walletName.optional(),
  type: z.enum(WALLET_TYPES).optional(),
  currency: currencyCode.optional(),
  initialBalance: signedAmount.optional(),
  isDefault: z.literal(true).optional(),
});
export type UpdateWalletRequestDto = z.infer<typeof updateWalletRequestSchema>;

// ---------- Response DTOs ----------

export const walletResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(WALLET_TYPES),
    currency: z.string(),
    isDefault: z.boolean(),
    balance: z.number().meta({ description: "Saldo atual na moeda da carteira" }),
    initialBalance: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Wallet" });
export type WalletResponseDto = z.infer<typeof walletResponseSchema>;

export const walletListResponseSchema = z.object({ data: z.array(walletResponseSchema) });
export type WalletListResponseDto = z.infer<typeof walletListResponseSchema>;

export const walletSummaryResponseSchema = z.object({
  primaryCurrency: z.string(),
  totalBalance: z.number().nullable().meta({ description: "Nulo se alguma cotação estiver indisponível" }),
  ratesUpdatedAt: z.string().nullable(),
  ratesStale: z.boolean(),
  wallets: z.array(walletResponseSchema.extend({ balanceInPrimaryCurrency: z.number().nullable() })),
});
export type WalletSummaryResponseDto = z.infer<typeof walletSummaryResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const walletRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar carteiras com saldo atual (R53, R55)",
    security: secured,
    response: { 200: walletListResponseSchema },
  },
  summary: {
    tags: TAGS,
    summary: "Resumo da tela inicial: saldo de cada carteira e total na moeda principal (R55, R28, R29)",
    security: secured,
    response: { 200: walletSummaryResponseSchema },
  },
  create: {
    tags: TAGS,
    summary: "Criar carteira (R53), com moeda própria (R56)",
    security: secured,
    body: createWalletRequestSchema,
    response: { 201: walletResponseSchema },
  },
  get: {
    tags: TAGS,
    summary: "Detalhar carteira",
    security: secured,
    params: idParams,
    response: { 200: walletResponseSchema },
  },
  update: {
    tags: TAGS,
    summary: "Atualizar carteira",
    description: "A moeda só pode ser alterada enquanto a carteira não tiver movimentações.",
    security: secured,
    params: idParams,
    body: updateWalletRequestSchema,
    response: { 200: walletResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir carteira sem movimentações",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
