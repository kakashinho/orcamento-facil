import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  currencyCode,
  idParams,
  requiredText,
  responseId,
  responseTimestamp,
  secured,
  signedAmount,
} from "../../../infrastructure/http/common-schemas.js";
import { WALLET_TYPES } from "../types/wallet.types.js";

const TAGS = ["Carteiras"];

const walletName = requiredText(60, "Informe o nome da carteira.").meta({ example: "Conta corrente" });
const walletType = z.enum(WALLET_TYPES).meta({
  description: "checking = conta corrente; savings = poupança; cash = dinheiro; investment; credit_card; other",
});

// ---------- Request DTOs ----------

export const createWalletRequestSchema = z.strictObject({
  name: walletName,
  type: walletType.optional().meta({ description: "Padrão: other" }),
  currency: currencyCode.optional().meta({ description: "Moeda da carteira (R56). Padrão: moeda principal do usuário" }),
  initialBalance: signedAmount.optional().meta({ description: "Saldo inicial. Padrão: 0" }),
  isDefault: z.boolean().optional().meta({ description: "Torna esta a carteira padrão das novas transações" }),
});
export type CreateWalletRequestDto = z.infer<typeof createWalletRequestSchema>;

export const updateWalletRequestSchema = z.strictObject({
  name: walletName.optional(),
  type: walletType.optional(),
  currency: currencyCode.optional().meta({ description: "Só pode mudar enquanto a carteira não tiver movimentações" }),
  initialBalance: signedAmount.optional(),
  isDefault: z
    .literal(true, "Para trocar a carteira padrão, marque outra carteira como padrão.")
    .optional()
    .meta({ description: "Só aceita true: marque outra carteira para trocar a padrão" }),
});
export type UpdateWalletRequestDto = z.infer<typeof updateWalletRequestSchema>;

// ---------- Response DTOs ----------

export const walletResponseSchema = z
  .object({
    id: responseId,
    name: z.string(),
    type: walletType,
    currency: z.string(),
    isDefault: z.boolean(),
    balance: z.number().meta({ description: "Saldo atual na moeda da carteira (R55)" }),
    initialBalance: z.number(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .meta({ id: "Wallet" });
export type WalletResponseDto = z.infer<typeof walletResponseSchema>;

export const walletListResponseSchema = z.object({ data: z.array(walletResponseSchema) });
export type WalletListResponseDto = z.infer<typeof walletListResponseSchema>;

export const walletSummaryResponseSchema = z
  .object({
    primaryCurrency: z.string(),
    totalBalance: z.number().nullable().meta({ description: "Soma na moeda principal; nulo se faltar alguma cotação" }),
    ratesUpdatedAt: responseTimestamp.nullable(),
    ratesStale: z.boolean().meta({ description: "true = cotação de cache após falha do provedor" }),
    wallets: z.array(
      walletResponseSchema.extend({
        balanceInPrimaryCurrency: z.number().nullable().meta({ description: "Saldo convertido (R28, R29)" }),
      }),
    ),
  })
  .meta({ id: "WalletSummary" });
export type WalletSummaryResponseDto = z.infer<typeof walletSummaryResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const walletRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Listar carteiras com saldo atual (R53, R55)",
    description: "A carteira padrão vem primeiro; as demais, por ordem de criação.",
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
    description:
      "Envie apenas os campos alterados. A moeda só pode mudar enquanto a carteira não tiver movimentações (409 WALLET_HAS_MOVEMENTS). Alterar o saldo inicial ajusta o saldo atual pela diferença.",
    security: secured,
    params: idParams,
    body: updateWalletRequestSchema,
    response: { 200: walletResponseSchema },
  },
  remove: {
    tags: TAGS,
    summary: "Excluir carteira sem movimentações",
    description: "Com transações ou transferências ativas: 409 WALLET_NOT_EMPTY (details traz as quantidades).",
    security: secured,
    params: idParams,
  },
} satisfies Record<string, FastifySchema>;
