import { addDays, isValidIsoDate } from "../../../shared/utils/dates.js";
import { capitalizeFirst, normalizeText, tokenize } from "../../../shared/utils/text.js";
import type { TransactionType } from "../types/transaction.types.js";

/**
 * Apoio ao registro por comando de voz (R65): o aplicativo converte o áudio em texto
 * no dispositivo e o backend interpreta frases como
 *   "gastei 35,90 no mercado ontem" ou "recebi 2.500 de salário dia 5"
 * produzindo um rascunho de transação para o usuário confirmar.
 */
export interface TransactionDraft {
  type: TransactionType;
  amount: number | null;
  date: string;
  description: string;
}

const INCOME_WORDS = [
  "recebi", "receber", "recebido", "ganhei", "ganho", "salario", "entrada", "receita", "deposito",
  "depositaram", "depositado", "venda", "vendi", "reembolso", "caiu", "rendimento", "freela",
];

const ACTION_WORDS = new Set([
  "gastei", "paguei", "comprei", "gasto", "gasta", "despesa", "pago", "paga", "pagar", "recebi", "receber",
  "recebido", "ganhei", "depositaram", "depositado", "vendi", "caiu", "foi", "foram", "registrar", "registra",
  "anota", "anotar", "adicionar", "adiciona", "lancar", "lanca",
]);

const EDGE_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "no", "na", "nos", "nas", "em", "com", "para", "pra", "pro", "um", "uma",
  "o", "a", "os", "as", "e", "por", "ao", "que", "eu",
]);

// Grupos: 1 valor; 2 centavos explícitos ("e 50 centavos"); 3-4 centavos falados ("35 e 90" = 35,90),
// que o reconhecedor de voz devolve assim e só valem quando o valor é inteiro.
const AMOUNT_PATTERN =
  /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|real|conto|contos|pila|pilas))?(?:\s*e\s*(\d{1,2})\s*centavos?|(\s+e\s+(\d{2})(?!\d)))?/i;

function parseAmount(raw: string, centsPart: string | undefined): number | null {
  let normalized = raw;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = raw.replace(",", ".");
  }
  let value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (centsPart) value += Number(centsPart) / 100;
  return Math.round(value * 100) / 100;
}

function extractDate(text: string, today: string): { date: string; consumed: RegExp | null } {
  const normalized = normalizeText(text);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];

  const explicit = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (explicit) {
    const d = Number(explicit[1]);
    const m = Number(explicit[2]);
    let y = explicit[3] ? Number(explicit[3]) : year;
    if (y < 100) y += 2000;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isValidIsoDate(iso)) return { date: iso, consumed: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/ };
  }

  const dayOfMonth = /\bdia\s+(\d{1,2})\b/.exec(normalized);
  if (dayOfMonth) {
    const d = Number(dayOfMonth[1]);
    // "dia 25" dito no dia 3 refere-se ao mês anterior.
    let y = year;
    let m = month;
    if (d > day) {
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isValidIsoDate(iso)) return { date: iso, consumed: /\bdia\s+\d{1,2}\b/i };
  }

  if (/\banteontem\b/.test(normalized)) return { date: addDays(today, -2), consumed: /\banteontem\b/i };
  if (/\bontem\b/.test(normalized)) return { date: addDays(today, -1), consumed: /\bontem\b/i };
  if (/\bhoje\b/.test(normalized)) return { date: today, consumed: /\bhoje\b/i };
  return { date: today, consumed: null };
}

export function parseTransactionText(text: string, today: string): TransactionDraft {
  let remaining = text.trim();

  const { date, consumed } = extractDate(remaining, today);
  if (consumed) remaining = remaining.replace(consumed, " ");

  let amount: number | null = null;
  const amountMatch = AMOUNT_PATTERN.exec(remaining);
  if (amountMatch) {
    const raw = amountMatch[1]!;
    const spokenCents = /^\d+$/.test(raw) ? amountMatch[4] : undefined;
    amount = parseAmount(raw, amountMatch[2] ?? spokenCents);
    const matched = !amountMatch[2] && !spokenCents && amountMatch[3] ? amountMatch[0].slice(0, -amountMatch[3].length) : amountMatch[0];
    remaining = remaining.replace(matched, " ");
  }

  const type: TransactionType = tokenize(text).some((word) => INCOME_WORDS.includes(word)) ? "income" : "expense";

  const words = remaining
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 0 && !ACTION_WORDS.has(normalizeText(word)));
  while (words.length > 0 && EDGE_STOPWORDS.has(normalizeText(words[0]!))) words.shift();
  while (words.length > 0 && EDGE_STOPWORDS.has(normalizeText(words[words.length - 1]!))) words.pop();

  const description = words.join(" ").slice(0, 200);
  return {
    type,
    amount,
    date,
    description: description.length > 0 ? capitalizeFirst(description) : type === "income" ? "Receita" : "Despesa",
  };
}
