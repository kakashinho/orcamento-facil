import { z } from "zod";
import { isValidIsoDate } from "../../shared/utils/dates.js";
import { MAX_AMOUNT } from "../../shared/utils/money.js";

export const idParams = z.object({ id: z.uuid() });

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
  .refine(isValidIsoDate, "Data inválida")
  .meta({ description: "Data no formato AAAA-MM-DD", example: "2026-10-03" });

export const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM")
  .meta({ description: "Mês no formato AAAA-MM", example: "2026-10" });

export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Use o código ISO 4217 com 3 letras maiúsculas (ex.: BRL)")
  .meta({ description: "Código de moeda ISO 4217", example: "BRL" });

/** Valor monetário positivo com até duas casas decimais (convertido para centavos no serviço). */
export const positiveAmount = z
  .number()
  .positive("O valor deve ser maior que zero")
  .max(MAX_AMOUNT)
  .meta({ description: "Valor positivo com até 2 casas decimais", example: 35.9 });

export const signedAmount = z
  .number()
  .min(-MAX_AMOUNT)
  .max(MAX_AMOUNT)
  .meta({ description: "Valor com até 2 casas decimais", example: 1500 });

export const timestamp = z.string().meta({ description: "Data/hora ISO 8601 (UTC)", example: "2026-10-03T12:00:00.000Z" });

export const errorResponse = z
  .object({
    statusCode: z.number(),
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .meta({ id: "ErrorResponse", description: "Formato padrão de erro" });

export const limitQuery = z.coerce.number().int().min(1).max(100).default(20);

export const walletRef = z.object({ id: z.uuid(), name: z.string(), currency: z.string() });
export const categoryRef = z.object({ id: z.uuid(), name: z.string(), predefined: z.boolean() });
export const tagRef = z.object({ id: z.uuid(), name: z.string() });

export const secured = [{ bearerAuth: [] }];
