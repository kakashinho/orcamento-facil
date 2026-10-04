import { z } from "zod";
import { isValidIsoDate, isValidTimeZone } from "../../shared/utils/dates.js";
import { isSupportedCurrency, MAX_AMOUNT } from "../../shared/utils/money.js";

/**
 * Blocos de validação compartilhados pelos DTOs. Regras gerais:
 * - textos têm os espaços das pontas removidos ANTES de validar ("   " não é um nome);
 * - corpos e query strings são objetos estritos: campo desconhecido é erro, não é ignorado;
 * - mensagens em português, para o app exibir junto do campo (`details[].path`).
 */

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const MAX_PERIOD_DAYS = 366 * 5;
export const MAX_PERIOD_MONTHS = 36;

// ---------- identificadores ----------

export const uuid = (message = "Identificador inválido.") => z.uuid(message);

export const idParams = z.strictObject({ id: uuid() });

// ---------- textos ----------

/** Texto obrigatório: espaços das pontas removidos; vazio é rejeitado. */
export function requiredText(max: number, emptyMessage = "Campo obrigatório.") {
  return z.string().trim().min(1, emptyMessage).max(max, `Use no máximo ${max} caracteres.`);
}

/** Texto opcional: espaços das pontas removidos; vazio é aceito (o service trata como ausente). */
export function optionalText(max: number) {
  return z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
}

// ---------- e-mail ----------

/** E-mail sem espaços nas pontas e em minúsculas (teclados de celular costumam inserir espaço e maiúscula). */
export const email = z
  .preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.email("Informe um e-mail válido.").max(320, "Use no máximo 320 caracteres."),
  )
  .meta({ example: "maria@exemplo.com" });

// ---------- datas ----------

function yearInRange(value: string): boolean {
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Use o formato AAAA-MM-DD.", abort: true })
  .refine(isValidIsoDate, { message: "Data inválida.", abort: true })
  .refine(yearInRange, `Use uma data entre ${MIN_YEAR} e ${MAX_YEAR}.`)
  .meta({ description: "Data no formato AAAA-MM-DD", example: "2026-10-03" });

export const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Use o formato AAAA-MM.", abort: true })
  .refine(yearInRange, `Use um mês entre ${MIN_YEAR} e ${MAX_YEAR}.`)
  .meta({ description: "Mês no formato AAAA-MM", example: "2026-10" });

export const timeZone = z
  .string()
  .trim()
  .min(1, "Campo obrigatório.")
  .max(64, "Use no máximo 64 caracteres.")
  .refine(isValidTimeZone, "Fuso horário inválido. Use um identificador IANA (ex.: America/Sao_Paulo).")
  .meta({ example: "America/Sao_Paulo" });

// ---------- moedas e valores ----------

/** Código ISO 4217 aceito pelo servidor (maiúsculas ou minúsculas: " brl " vira "BRL"). */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: "Use o código ISO 4217 com 3 letras (ex.: BRL).", abort: true })
  .refine(isSupportedCurrency, "Moeda não suportada. Consulte GET /api/currencies.")
  .meta({ description: "Código de moeda ISO 4217 (lista em GET /api/currencies)", example: "BRL" });

const TWO_DECIMALS = "Use no máximo duas casas decimais.";
const ABOVE_MAX = "Valor acima do máximo permitido.";

/** Valor monetário positivo com até duas casas decimais (convertido para centavos no service). */
export const positiveAmount = z
  .number()
  .positive("O valor deve ser maior que zero.")
  .max(MAX_AMOUNT, ABOVE_MAX)
  .multipleOf(0.01, TWO_DECIMALS)
  .meta({ description: "Valor positivo com até 2 casas decimais, na moeda da carteira", example: 35.9 });

/** Valor com sinal (ex.: saldo inicial de cartão de crédito), até duas casas decimais. */
export const signedAmount = z
  .number()
  .min(-MAX_AMOUNT, ABOVE_MAX)
  .max(MAX_AMOUNT, ABOVE_MAX)
  .multipleOf(0.01, TWO_DECIMALS)
  .meta({ description: "Valor com até 2 casas decimais (pode ser negativo)", example: 1500 });

// ---------- paginação ----------

export function limitQuery(max = 100, fallback = 20) {
  return z.coerce
    .number()
    .int("Use um número inteiro.")
    .min(1, "O mínimo é 1.")
    .max(max, `O máximo é ${max}.`)
    .default(fallback)
    .meta({ description: `Itens por página (1 a ${max})` });
}

export const cursorQuery = z
  .string()
  .max(500, "Cursor inválido.")
  .meta({ description: "Valor de `nextCursor` da página anterior" });

// ---------- períodos ----------

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

/**
 * Regra cruzada de período: `to` não pode ser anterior a `from` e, se informado, o período
 * não pode passar de `maxDays`. O erro aponta o campo `to` para o app destacá-lo.
 */
export function dateRangeRule(fromKey: string, toKey: string, maxDays?: number) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const from = value[fromKey];
    const to = value[toKey];
    if (typeof from !== "string" || typeof to !== "string") return;
    if (from > to) {
      ctx.addIssue({ code: "custom", path: [toKey], message: "A data final deve ser igual ou posterior à inicial." });
    } else if (maxDays !== undefined && daysBetween(from, to) > maxDays) {
      ctx.addIssue({ code: "custom", path: [toKey], message: `O período máximo é de ${Math.round(maxDays / 366)} anos.` });
    }
  };
}

// ---------- respostas ----------

export const responseId = z.uuid();
export const responseTimestamp = z.iso.datetime().meta({ description: "Data/hora ISO 8601 (UTC)" });
export const responseDate = z.iso.date().meta({ description: "Data AAAA-MM-DD" });

/** Formato único de erro da API. `details` traz a lista de campos com problema, quando houver. */
export const errorResponse = z.object({
  statusCode: z.number(),
  code: z.string().meta({ description: "Código estável para o app tratar o erro" }),
  message: z.string().meta({ description: "Mensagem em português para o usuário" }),
  details: z.unknown().optional().meta({
    description: "Em erros de validação: lista de { location, path, message }",
  }),
});

export const secured = [{ bearerAuth: [] }];
